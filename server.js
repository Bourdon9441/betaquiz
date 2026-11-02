const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const sharedQuizFile = path.join(__dirname, "data", "shared-quizzes.json");
const PORT = Number(process.env.PORT) || 3000;
const REVEAL_SECONDS = 4;

const demoQuiz = [
  {
    question: "Quelle planète est surnommée la planète rouge ?",
    choices: ["Vénus", "Mars", "Jupiter", "Mercure"],
    answer: 1
  },
  {
    question: "Combien de côtés possède un hexagone ?",
    choices: ["Cinq", "Six", "Sept", "Huit"],
    answer: 1
  },
  {
    question: "Quel est le plus grand océan du monde ?",
    choices: ["Atlantique", "Indien", "Arctique", "Pacifique"],
    answer: 3
  },
  {
    question: "Quel langage est principalement utilisé pour structurer une page web ?",
    choices: ["HTML", "SQL", "Python", "Bash"],
    answer: 0
  },
  {
    question: "Combien de minutes y a-t-il dans deux heures ?",
    choices: ["100", "110", "120", "140"],
    answer: 2
  }
];

app.use(express.json({ limit: "1mb" }));

function cleanImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && url.toString().length <= 500 ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 20) : "";
}

function getJoinOrigin(origin) {
  const baseUrl = new URL(origin);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("Unsupported protocol for join URL");
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(baseUrl.hostname)) return baseUrl.origin;

  const privateAddress = (address) =>
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address);
  const interfacePriority = (name) => {
    if (/wi-?fi|wlan/i.test(name)) return 0;
    if (/ethernet/i.test(name)) return 1;
    if (/virtual|vmware|vbox|hyper-v|docker|wsl|vpn/i.test(name)) return 3;
    return 2;
  };
  const addresses = Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) => (entries || [])
      .filter((entry) => !entry.internal && entry.family === "IPv4" && privateAddress(entry.address))
      .map((entry) => ({ name, address: entry.address })))
    .sort((first, second) => interfacePriority(first.name) - interfacePriority(second.name));
  if (addresses.length) baseUrl.hostname = addresses[0].address;
  return baseUrl.origin;
}

function cleanQuiz(value) {
  if (!Array.isArray(value) || value.length < 1) return null;
  const questions = [];
  for (const item of value) {
    if (!item || typeof item.question !== "string") {
      return null;
    }
    const question = item.question.trim();
    const type = ["choice", "truefalse", "open"].includes(item.type) ? item.type : "choice";
    if (!question || question.length > 160) return null;
    if (type === "open") {
      const answer = typeof item.answer === "string" ? item.answer.trim() : "";
      if (!answer || answer.length > 80) return null;
      questions.push({ question, type, choices: [], answer });
      continue;
    }
    if (!Array.isArray(item.choices) || !Number.isInteger(item.answer) ||
      item.answer < 0 || item.answer > (type === "truefalse" ? 1 : 3)) return null;
    const choices = type === "truefalse"
      ? ["Vrai", "Faux"]
      : item.choices.map((choice) => typeof choice === "string" ? choice.trim() : "");
    if (choices.length !== (type === "truefalse" ? 2 : 4) ||
      choices.some((choice) => !choice || choice.length > 80)) return null;
    questions.push({ question, type, choices, answer: item.answer });
  }
  return questions;
}

function cleanQuizPackage(value) {
  if (!value || typeof value !== "object") return null;
  const questions = cleanQuiz(value.questions);
  const image = cleanImageUrl(value.image || "");
  const title = typeof value.title === "string" ? value.title.trim().replace(/\s+/g, " ").slice(0, 50) : "";
  const category = typeof value.category === "string" ? value.category.trim().replace(/\s+/g, " ").slice(0, 30) : "";
  const duration = Number(value.duration);
  if (!questions || !title || !category || image === null || !Number.isInteger(duration) || duration < 5 || duration > 60) return null;
  return {
    title,
    category,
    image,
    duration,
    teamMode: value.teamMode === true,
    questions
  };
}

function loadSharedQuizzes() {
  try {
    if (!fs.existsSync(sharedQuizFile)) return new Map();
    const quizzes = JSON.parse(fs.readFileSync(sharedQuizFile, "utf8"));
    if (!quizzes || typeof quizzes !== "object" || Array.isArray(quizzes)) {
      throw new Error("Le fichier des quiz partagés doit contenir un objet.");
    }
    const entries = Object.entries(quizzes).map(([id, quiz]) => [id, cleanQuizPackage(quiz)]);
    if (entries.some(([, quiz]) => !quiz)) throw new Error("Un quiz partagé enregistré est invalide.");
    return new Map(entries);
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw new Error(`Impossible de charger les quiz partagés : ${error.message}`);
  }
}

const sharedQuizzes = loadSharedQuizzes();

app.post("/api/shared-quizzes", (request, response) => {
  const quiz = cleanQuizPackage(request.body);
  if (!quiz) return response.status(400).json({ error: "Les informations du quiz partagé sont invalides." });
  const id = crypto.randomUUID();
  sharedQuizzes.set(id, quiz);
  let temporaryFile = "";
  try {
    fs.mkdirSync(path.dirname(sharedQuizFile), { recursive: true });
    temporaryFile = `${sharedQuizFile}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(Object.fromEntries(sharedQuizzes)), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryFile, sharedQuizFile);
    response.status(201).json({ id });
  } catch (error) {
    sharedQuizzes.delete(id);
    if (temporaryFile && fs.existsSync(temporaryFile)) {
      try {
        fs.unlinkSync(temporaryFile);
      } catch (cleanupError) {
        console.error("Impossible de supprimer le fichier temporaire du quiz partagé :", cleanupError);
      }
    }
    console.error("Impossible d’enregistrer le quiz partagé :", error);
    response.status(500).json({ error: "Impossible d’enregistrer le quiz partagé sur le serveur." });
  }
});

app.get("/api/shared-quizzes/:id", (request, response) => {
  const quiz = sharedQuizzes.get(request.params.id);
  if (!quiz) return response.status(404).json({ error: "Ce quiz partagé est introuvable." });
  response.json(quiz);
});

app.use(express.static(path.join(__dirname, "public")));

function makeCode() {
  let code;
  do {
    code = crypto.randomInt(100000, 1000000).toString();
  } while (rooms.has(code));
  return code;
}

function roomScoreboard(room) {
  if (room.teamMode) {
    return [...room.teamScores.entries()]
      .map(([id, score]) => ({ id, name: id === "A" ? "Équipe A" : "Équipe B", score }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }
  return [...room.players.values()]
    .map(({ id, name, score }) => ({ id, name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function publicState(room, forHost = false) {
  const activeStatus = room.status === "paused" ? room.pausedFrom : room.status;
  const question = ["question", "review", "reveal"].includes(activeStatus)
    ? room.quiz[room.questionIndex]
    : null;
  return {
    status: room.status,
    quizTitle: room.title,
    category: room.category,
    image: room.image,
    teamMode: room.teamMode,
    scoreboardVisible: room.scoreboardVisible,
    quizQuestionCount: room.quiz.length,
    hostName: room.hostName,
    players: [...room.players.values()]
      .map(({ id, name, score, answered, team }) => ({ id, name, score, answered, team: room.teamMode ? team : null }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    question: question && {
      text: question.question,
      type: question.type,
      choices: question.choices,
      index: room.questionIndex,
      total: room.quiz.length,
      seconds: room.status === "paused"
        ? Math.max(0, Math.ceil(room.remainingMs / 1000))
        : room.status === "question"
        ? Math.max(0, Math.ceil(((room.timerEndsAt || Date.now() + room.duration * 1000) - Date.now()) / 1000))
        : room.status === "review"
          ? Math.max(0, Math.ceil((room.reviewEndsAt - Date.now()) / 1000))
          : 0,
      correctAnswer: activeStatus === "reveal" ? question.answer : null,
      submissions: forHost && question.type === "open"
        ? [...room.players.values()]
          .filter((player) => player.response)
          .map(({ id, name, response, reviewed, responseCorrect, team }) => ({ id, name, response, reviewed, responseCorrect, team }))
        : []
    },
    scoreboard: room.status === "reveal" || room.status === "finished" || room.scoreboardVisible ? roomScoreboard(room) : [],
    leaderboard: room.status === "finished" ? roomScoreboard(room) : null
  };
}

function broadcast(room) {
  io.to(room.code).emit("room-state", publicState(room));
  io.to(room.hostId).emit("room-state", publicState(room, true));
}

function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
  room.timerEndsAt = null;
}

function scheduleTimer(room, delay, action) {
  clearTimer(room);
  room.timerAction = action;
  room.timerEndsAt = Date.now() + delay;
  room.timer = setTimeout(() => {
    room.timer = null;
    room.timerEndsAt = null;
    room.timerAction = null;
    action();
  }, delay);
}

function advanceQuestion(room) {
  clearTimer(room);
  room.questionIndex += 1;
  if (room.questionIndex >= room.quiz.length) {
    room.status = "finished";
    room.pausedFrom = null;
    room.scoreboardVisible = true;
    broadcast(room);
    return;
  }
  showQuestion(room);
}

function endRoom(room) {
  clearTimer(room);
  io.to(room.code).emit("room-closed");
  rooms.delete(room.code);
}

function showQuestion(room) {
  room.status = "question";
  room.pausedFrom = null;
  room.reviewEndsAt = null;
  room.questionStartedAt = Date.now();
  room.answers.clear();
  for (const player of room.players.values()) {
    player.answered = false;
    player.response = "";
    player.reviewed = false;
    player.responseCorrect = false;
  }
  broadcast(room);
  scheduleTimer(room, room.duration * 1000, () => {
    if (room.quiz[room.questionIndex].type !== "open") {
      revealAnswer(room);
      return;
    }
    room.status = "review";
    for (const player of room.players.values()) {
      if (!player.answered) {
        player.answered = true;
        player.reviewed = true;
      }
    }
    room.reviewEndsAt = Date.now() + 30 * 1000;
    broadcast(room);
    if ([...room.players.values()].every((player) => player.reviewed)) {
      revealAnswer(room);
      return;
    }
    scheduleTimer(room, 30 * 1000, () => {
      for (const player of room.players.values()) player.reviewed = true;
      revealAnswer(room);
    });
  });
}

function revealAnswer(room) {
  if (room.status !== "question" && room.status !== "review") return;
  clearTimer(room);
  room.status = "reveal";
  room.reviewEndsAt = null;
  broadcast(room);
  scheduleTimer(room, REVEAL_SECONDS * 1000, () => advanceQuestion(room));
}

io.on("connection", (socket) => {
  socket.on("create-room", async (payload, callback) => {
    const name = cleanName(payload && payload.name);
    if (!name) return callback?.({ error: "Entre un prénom ou un pseudo." });
    const title = typeof (payload && payload.title) === "string"
      ? payload.title.trim().replace(/\s+/g, " ").slice(0, 50)
      : "";
    const category = typeof (payload && payload.category) === "string"
      ? payload.category.trim().replace(/\s+/g, " ").slice(0, 30)
      : "Culture générale";
    const image = cleanImageUrl(payload && payload.image || "");
    const duration = Number(payload && payload.duration || 15);
    const customQuiz = payload && payload.quiz !== undefined ? cleanQuiz(payload.quiz) : cleanQuiz(demoQuiz);
    if (!customQuiz) return callback?.({ error: "Vérifie chaque question : 4 choix pour un QCM, ou une bonne réponse pour les autres formats." });
    if (payload && payload.title !== undefined && !title) {
      return callback?.({ error: "Donne un titre à ton quiz." });
    }
    if (!category || image === null || !Number.isInteger(duration) || duration < 5 || duration > 60) {
      return callback?.({ error: "Vérifie la catégorie, l’image et la durée des questions (de 5 à 60 secondes)." });
    }

    const code = makeCode();
    const room = {
      code,
      title: title || "Quiz de démonstration",
      category,
      image,
      duration,
      teamMode: Boolean(payload && payload.teamMode),
      teamScores: new Map([["A", 0], ["B", 0]]),
      hostName: name,
      hostId: socket.id,
      status: "lobby",
      scoreboardVisible: false,
      quiz: customQuiz,
      questionIndex: -1,
      players: new Map(),
      answers: new Set(),
      timer: null,
      timerAction: null,
      timerEndsAt: null,
      pausedFrom: null,
      remainingMs: 0
    };
    rooms.set(code, room);
    socket.join(code);
    const requestOrigin = socket.handshake.headers.origin || `http://${socket.handshake.headers.host || ""}`;
    let joinUrl;
    try {
      joinUrl = new URL(`/?code=${code}`, getJoinOrigin(requestOrigin)).toString();
    } catch (error) {
      rooms.delete(code);
      socket.leave(code);
      console.error("Impossible de créer le lien de la partie :", error);
      callback?.({ error: "Impossible de créer le lien pour rejoindre la partie." });
      return;
    }

    try {
      const joinQrCode = await QRCode.toDataURL(joinUrl, { width: 180, margin: 1 });
      if (!socket.connected || !rooms.has(code)) return;
      callback?.({ code, state: publicState(room), joinUrl, joinQrCode });
    } catch (error) {
      rooms.delete(code);
      socket.leave(code);
      console.error("Impossible de générer le QR code de la partie :", error);
      callback?.({ error: "Impossible de générer le QR code de la partie." });
    }
  });

  socket.on("join-room", (payload, callback) => {
    const code = typeof (payload && payload.code) === "string"
      ? payload.code.trim().replace(/\D/g, "").slice(0, 6)
      : "";
    const name = cleanName(payload && payload.name);
    const room = rooms.get(code);
    if (!name) return callback?.({ error: "Entre un prénom ou un pseudo." });
    if (!room) return callback?.({ error: "Ce code de partie est introuvable." });
    if (room.hostId === socket.id) {
      return callback?.({ error: "L’animateur ne peut pas rejoindre sa propre partie comme joueur." });
    }
    if (room.status !== "lobby") return callback?.({ error: "Cette partie a déjà commencé." });

    const duplicate = [...room.players.values()].some(
      (player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    if (duplicate) return callback?.({ error: "Ce pseudo est déjà utilisé dans cette partie." });

    const team = room.teamMode
      ? [...room.players.values()].filter((player) => player.team === "A").length <=
        [...room.players.values()].filter((player) => player.team === "B").length ? "A" : "B"
      : null;
    room.players.set(socket.id, { id: socket.id, name, score: 0, answered: false, team, response: "", reviewed: false, responseCorrect: false });
    socket.join(code);
    callback?.({ code, state: publicState(room) });
    broadcast(room);
  });

  socket.on("start-game", (callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    if (!room || room.status !== "lobby") {
      return callback?.({ error: "Impossible de démarrer cette partie." });
    }
    if (room.players.size === 0) {
      return callback?.({ error: "Attends qu’au moins un joueur rejoigne la partie." });
    }
    room.questionIndex = 0;
    showQuestion(room);
    callback?.({ ok: true });
  });

  socket.on("submit-answer", (choice, callback) => {
    const room = [...rooms.values()].find((item) => item.players.has(socket.id));
    if (!room || room.status !== "question") {
      return callback?.({ error: "La question n’accepte pas de réponse." });
    }
    const player = room.players.get(socket.id);
    if (player.answered) return callback?.({ error: "Ta réponse a déjà été envoyée." });
    const question = room.quiz[room.questionIndex];
    let response;
    if (question.type === "open") {
      response = typeof choice === "string" ? choice.trim().slice(0, 80) : "";
      if (!response) return callback?.({ error: "Écris une réponse avant de l’envoyer." });
    } else if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) {
      return callback?.({ error: "Réponse invalide." });
    } else {
      response = choice;
    }
    player.answered = true;
    if (question.type === "open") {
      player.response = response;
    } else {
      room.answers.add(socket.id);
      if (response === question.answer) {
        const points = 1000 + Math.max(0, Math.round((room.duration * 1000 - (Date.now() - room.questionStartedAt)) / 20));
        if (room.teamMode) room.teamScores.set(player.team, room.teamScores.get(player.team) + points);
        else player.score += points;
      }
    }
    callback?.({ ok: true });
    broadcast(room);

    const activePlayers = [...room.players.values()];
    if (question.type !== "open" && activePlayers.length > 0 && activePlayers.every((item) => item.answered)) revealAnswer(room);
  });

  socket.on("review-answer", (payload, callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    if (!room || !["question", "review"].includes(room.status) || room.quiz[room.questionIndex].type !== "open") {
      return callback?.({ error: "Aucune réponse ouverte n’attend de validation." });
    }
    const player = room.players.get(payload && payload.playerId);
    if (!player || !player.answered || player.reviewed || typeof payload.correct !== "boolean") {
      return callback?.({ error: "Cette réponse ne peut pas être validée." });
    }
    player.reviewed = true;
    player.responseCorrect = payload.correct;
    if (payload.correct) {
      const points = 1000 + Math.max(0, Math.round((room.duration * 1000 - (Date.now() - room.questionStartedAt)) / 20));
      if (room.teamMode) room.teamScores.set(player.team, room.teamScores.get(player.team) + points);
      else player.score += points;
    }
    callback?.({ ok: true });
    broadcast(room);
    const activePlayers = [...room.players.values()];
    if (activePlayers.length > 0 && activePlayers.every((item) => item.answered && item.reviewed)) revealAnswer(room);
  });

  socket.on("skip-question", (callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    if (!room || !["question", "review", "reveal", "paused"].includes(room.status)) {
      return callback?.({ error: "Il n’y a aucune question à passer." });
    }
    advanceQuestion(room);
    callback?.({ ok: true });
  });

  socket.on("pause-game", (callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    if (!room || !["question", "review", "reveal"].includes(room.status) || !room.timerEndsAt) {
      return callback?.({ error: "Cette partie ne peut pas être mise en pause maintenant." });
    }
    room.pausedFrom = room.status;
    room.remainingMs = Math.max(0, room.timerEndsAt - Date.now());
    const pendingAction = room.timerAction;
    clearTimer(room);
    room.pausedAction = pendingAction;
    room.status = "paused";
    broadcast(room);
    callback?.({ ok: true });
  });

  socket.on("resume-game", (callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    if (!room || room.status !== "paused" || typeof room.pausedAction !== "function") {
      return callback?.({ error: "Cette partie n’est pas en pause." });
    }
    room.status = room.pausedFrom;
    const action = room.pausedAction;
    room.pausedAction = null;
    const remaining = room.remainingMs;
    room.remainingMs = 0;
    if (room.pausedFrom === "review") room.reviewEndsAt = Date.now() + remaining;
    scheduleTimer(room, remaining, action);
    broadcast(room);
    callback?.({ ok: true });
  });

  socket.on("end-game", (callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    if (!room || !["lobby", "question", "review", "reveal", "paused"].includes(room.status)) {
      return callback?.({ error: "Cette partie ne peut pas être terminée maintenant." });
    }
    clearTimer(room);
    room.status = "finished";
    room.pausedFrom = null;
    room.pausedAction = null;
    room.scoreboardVisible = true;
    broadcast(room);
    callback?.({ ok: true });
  });

  socket.on("remove-player", (playerId, callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    const player = room && room.players.get(playerId);
    if (!room || !player || room.status === "finished") {
      return callback?.({ error: "Ce joueur ne peut pas être exclu de la partie." });
    }
    room.players.delete(playerId);
    room.answers.delete(playerId);
    io.sockets.sockets.get(playerId)?.leave(room.code);
    io.to(playerId).emit("removed-from-room");
    const activePlayers = [...room.players.values()];
    if (room.status === "question" && activePlayers.length > 0 && activePlayers.every((item) => item.answered)) {
      if (room.quiz[room.questionIndex].type === "open") {
        room.status = "review";
        room.reviewEndsAt = Date.now() + 30 * 1000;
        scheduleTimer(room, 30 * 1000, () => {
          for (const remainingPlayer of room.players.values()) remainingPlayer.reviewed = true;
          revealAnswer(room);
        });
      } else {
        revealAnswer(room);
      }
    } else if (room.status === "review" && activePlayers.every((item) => item.answered && item.reviewed)) {
      revealAnswer(room);
    }
    broadcast(room);
    callback?.({ ok: true });
  });

  socket.on("toggle-scoreboard", (callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id);
    if (!room || room.status === "lobby" || room.status === "finished") {
      return callback?.({ error: "Le classement ne peut pas être affiché maintenant." });
    }
    room.scoreboardVisible = !room.scoreboardVisible;
    broadcast(room);
    callback?.({ ok: true });
  });

  const allowedReactions = new Map([
    ["applause", "👏"], ["laugh", "😂"], ["heart", "❤️"], ["fire", "🔥"], ["wow", "😮"]
  ]);
  socket.on("live-reaction", (reactionId, callback) => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id || item.players.has(socket.id));
    const emoji = allowedReactions.get(reactionId);
    if (!room || !emoji || room.status === "finished") {
      return callback?.({ error: "Cette réaction n’est pas disponible." });
    }
    const player = room.players.get(socket.id);
    const lastReactionAt = player ? player.lastReactionAt || 0 : room.hostLastReactionAt || 0;
    if (Date.now() - lastReactionAt < 700) {
      return callback?.({ error: "Attends un instant avant d’envoyer une autre réaction." });
    }
    if (player) player.lastReactionAt = Date.now();
    else room.hostLastReactionAt = Date.now();
    io.to(room.code).emit("live-reaction", { emoji, name: player ? player.name : room.hostName });
    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const room = [...rooms.values()].find((item) => item.hostId === socket.id || item.players.has(socket.id));
    if (!room) return;
    if (room.hostId === socket.id) {
      endRoom(room);
      return;
    }
    room.players.delete(socket.id);
    room.answers.delete(socket.id);
    if (room.status === "question") {
      const activePlayers = [...room.players.values()];
      if (activePlayers.length > 0 && activePlayers.every((item) => item.answered)) revealAnswer(room);
    }
    broadcast(room);
  });
});

server.listen(PORT, () => {
  console.log(`quizbeta est disponible sur http://localhost:${PORT}`);
});
