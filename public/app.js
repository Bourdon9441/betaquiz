const socket = io();
const homeScreen = document.querySelector("#home-screen");
const gameScreen = document.querySelector("#game-screen");
const gameContent = document.querySelector("#game-content");
const homeError = document.querySelector("#home-error");
const homeForms = document.querySelector("#home-forms");
const libraryPanel = document.querySelector("#library-panel");
let isHost = false;
let currentCode = "";
let hostJoinUrl = "";
let hostJoinQrCode = "";
let answered = false;
let timerInterval = null;
let renderedRoomView = "";
let soloQuiz = null;
let soloQuestionIndex = 0;
let soloScore = 0;
let soloAnswered = false;
let libraryMode = "library";

const builtInQuizzes = [
  {
    title: "Culture générale",
    category: "Culture générale",
    duration: 15,
    questions: [
      { question: "Quelle planète est surnommée la planète rouge ?", choices: ["Vénus", "Mars", "Jupiter", "Mercure"], answer: 1 },
      { question: "Combien de côtés possède un hexagone ?", choices: ["Cinq", "Six", "Sept", "Huit"], answer: 1 },
      { question: "Quel est le plus grand océan du monde ?", choices: ["Atlantique", "Indien", "Arctique", "Pacifique"], answer: 3 },
      { question: "Combien de minutes y a-t-il dans deux heures ?", choices: ["100", "110", "120", "140"], answer: 2 }
    ]
  },
  {
    title: "Sciences et nature",
    category: "Sciences",
    duration: 15,
    questions: [
      { question: "Quel gaz les plantes absorbent-elles principalement ?", choices: ["Oxygène", "Dioxyde de carbone", "Azote", "Hélium"], answer: 1 },
      { question: "Quel organe pompe le sang dans le corps humain ?", choices: ["Le foie", "Le cœur", "Le poumon", "Le rein"], answer: 1 },
      { question: "À quelle température l'eau bout-elle au niveau de la mer ?", choices: ["50 °C", "80 °C", "100 °C", "120 °C"], answer: 2 },
      { question: "Quel est le plus grand animal vivant ?", choices: ["L'éléphant d'Afrique", "La girafe", "La baleine bleue", "Le requin blanc"], answer: 2 }
    ]
  },
  {
    title: "Histoire",
    category: "Histoire",
    duration: 15,
    questions: [
      { question: "En quelle année débute la Révolution française ?", choices: ["1492", "1789", "1815", "1914"], answer: 1 },
      { question: "Quelle civilisation a construit le Colisée ?", choices: ["Les Grecs", "Les Romains", "Les Égyptiens", "Les Vikings"], answer: 1 },
      { question: "Quel navigateur atteint les Amériques en 1492 ?", choices: ["Marco Polo", "Christophe Colomb", "James Cook", "Vasco de Gama"], answer: 1 },
      { question: "Quel mur est tombé en 1989 ?", choices: ["Le mur de Berlin", "Le mur d'Hadrien", "La grande muraille", "Le mur de l'Atlantique"], answer: 0 }
    ]
  },
  {
    title: "Géographie",
    category: "Géographie",
    duration: 15,
    questions: [
      { question: "Quelle est la capitale du Canada ?", choices: ["Toronto", "Vancouver", "Ottawa", "Montréal"], answer: 2 },
      { question: "Sur quel continent se trouve le désert du Sahara ?", choices: ["Asie", "Afrique", "Amérique du Sud", "Océanie"], answer: 1 },
      { question: "Quel pays a la forme d'une botte ?", choices: ["Le Portugal", "La Grèce", "L'Italie", "La Croatie"], answer: 2 },
      { question: "Quelle est la capitale du Japon ?", choices: ["Kyoto", "Osaka", "Tokyo", "Séoul"], answer: 2 }
    ]
  },
  {
    title: "Arts et loisirs",
    category: "Arts et loisirs",
    duration: 15,
    questions: [
      { question: "Qui a peint La Joconde ?", choices: ["Claude Monet", "Léonard de Vinci", "Pablo Picasso", "Vincent van Gogh"], answer: 1 },
      { question: "Combien de cordes possède généralement un violon ?", choices: ["Quatre", "Six", "Huit", "Dix"], answer: 0 },
      { question: "Dans quel sport utilise-t-on un volant ?", choices: ["Tennis", "Badminton", "Squash", "Volley-ball"], answer: 1 },
      { question: "Quel instrument possède des touches noires et blanches ?", choices: ["La trompette", "Le piano", "La harpe", "Le violoncelle"], answer: 1 }
    ]
  }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showError(message) {
  homeError.textContent = message || "";
}

function enterRoom(code, state, host, joinInfo = {}) {
  currentCode = code;
  isHost = host;
  renderedRoomView = "";
  hostJoinUrl = host ? joinInfo.joinUrl || "" : "";
  hostJoinQrCode = host ? joinInfo.joinQrCode || "" : "";
  homeScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  document.querySelector("#active-code").textContent = code;
  showState(state);
}

function openLibrary(mode = "library") {
  libraryMode = mode;
  showError("");
  homeForms.classList.add("hidden");
  libraryPanel.classList.remove("hidden");
  renderLibrary();
}

function closeLibrary() {
  libraryPanel.classList.add("hidden");
  homeForms.classList.remove("hidden");
  showError("");
}

function renderLibrary(searchText = "") {
  const query = searchText.trim().toLocaleLowerCase("fr");
  const quizzes = builtInQuizzes.filter((quiz) =>
    `${quiz.title} ${quiz.category} ${quiz.questions.map((question) => question.question).join(" ")}`
      .toLocaleLowerCase("fr").includes(query)
  );
  const soloLabel = libraryMode === "solo" ? "Jouer seul" : "Jouer seul";
  libraryPanel.innerHTML = `
    <button class="text-button" id="close-library" type="button">← Retour</button>
    <h3>Bibliothèque de quiz</h3>
    <p class="library-intro">${libraryMode === "solo" ? "Choisis un quiz pour commencer une partie en solo." : "Choisis un quiz pour le lancer seul ou en partie multijoueur."}</p>
    <label class="library-search-label" for="library-search">Rechercher un quiz</label>
    <input id="library-search" type="search" value="${escapeHtml(searchText)}" placeholder="Titre, thème ou question">
    <p class="library-count">${quizzes.length} quiz${quizzes.length === 1 ? "" : " disponibles"}</p>
    <div class="library-list">${quizzes.length ? quizzes.map((quiz, index) => `
      <article class="library-card">
        <div><span class="category-label">${escapeHtml(quiz.category)}</span><h4>${escapeHtml(quiz.title)}</h4>
        <p>${quiz.questions.length} questions · ${quiz.duration} secondes par question en multijoueur</p></div>
        <div class="library-actions">
          <button class="button button-primary" type="button" data-play-solo="${index}">${soloLabel}</button>
          <button class="button button-secondary" type="button" data-play-room="${index}">Jouer en groupe</button>
        </div>
      </article>`).join("") : '<p class="library-empty">Aucun quiz ne correspond à cette recherche.</p>'}</div>`;

  document.querySelector("#close-library").addEventListener("click", closeLibrary);
  document.querySelector("#library-search").addEventListener("input", (event) => renderLibrary(event.target.value));
  libraryPanel.querySelectorAll("[data-play-solo]").forEach((button) => {
    button.addEventListener("click", () => startSolo(quizzes[Number(button.dataset.playSolo)]));
  });
  libraryPanel.querySelectorAll("[data-play-room]").forEach((button) => {
    button.addEventListener("click", () => createQuizRoom(quizzes[Number(button.dataset.playRoom)]));
  });
  document.querySelector("#library-search").focus({ preventScroll: true });
}

function startSolo(quiz) {
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    showError("Ce quiz ne contient aucune question.");
    return;
  }
  soloQuiz = quiz;
  soloQuestionIndex = 0;
  soloScore = 0;
  soloAnswered = false;
  homeScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  document.querySelector("#game-mode-label").textContent = "MODE SOLO";
  document.querySelector("#active-code").textContent = "";
  renderSoloQuestion();
}

function renderSoloQuestion() {
  const question = soloQuiz.questions[soloQuestionIndex];
  soloAnswered = false;
  const isOpen = question.type === "open";
  const choices = question.type === "truefalse" ? ["Vrai", "Faux"] : question.choices || [];
  const answerMarkup = isOpen
    ? `<form id="solo-answer-form" class="open-answer-form">
        <label for="solo-answer">Ta réponse</label><input id="solo-answer" maxlength="80" autocomplete="off" required>
        <button class="button button-primary" type="submit">Valider</button>
      </form>`
    : `<div class="answer-grid">${choices.map((choice, index) =>
      `<button class="answer-button" type="button" data-choice="${index}">${escapeHtml(choice)}</button>`
    ).join("")}</div>`;
  gameContent.innerHTML = `
    <div class="question-panel">
      <div class="question-meta"><span>${escapeHtml(soloQuiz.title)} · QUESTION ${soloQuestionIndex + 1} / ${soloQuiz.questions.length}</span></div>
      <div class="progress-track"><div class="progress-fill" style="transform:scaleX(${(soloQuestionIndex + 1) / soloQuiz.questions.length})"></div></div>
      <h2 class="question-text">${escapeHtml(question.question)}</h2>
      ${answerMarkup}<p id="solo-answer-status" class="answer-status" role="status"></p>
    </div>`;
  if (isOpen) {
    document.querySelector("#solo-answer-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const submitted = document.querySelector("#solo-answer").value.trim();
      if (submitted) submitSoloAnswer(normalizeAnswer(submitted) === normalizeAnswer(question.answer), question.answer);
    });
  } else {
    const buttons = [...gameContent.querySelectorAll("[data-choice]")];
    buttons.forEach((button) => button.addEventListener("click", () =>
      submitSoloAnswer(Number(button.dataset.choice) === question.answer, choices[question.answer])
    ));
  }
}

function normalizeAnswer(value) {
  return String(value).trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function submitSoloAnswer(isCorrect, correctAnswer) {
  if (soloAnswered) return;
  soloAnswered = true;
  if (isCorrect) soloScore += 1;
  const status = document.querySelector("#solo-answer-status");
  status.textContent = isCorrect ? "Bonne réponse !" : `La bonne réponse était : ${correctAnswer}`;
  gameContent.querySelectorAll("button, input").forEach((element) => { element.disabled = true; });
  const nextButton = document.createElement("button");
  nextButton.className = "button button-primary";
  nextButton.type = "button";
  nextButton.textContent = soloQuestionIndex + 1 === soloQuiz.questions.length ? "Voir mon résultat" : "Question suivante";
  status.after(nextButton);
  nextButton.addEventListener("click", () => {
    soloQuestionIndex += 1;
    if (soloQuestionIndex === soloQuiz.questions.length) renderSoloResults();
    else renderSoloQuestion();
  });
}

function renderSoloResults() {
  const total = soloQuiz.questions.length;
  const percentage = Math.round(soloScore / total * 100);
  gameContent.innerHTML = `
    <div class="result-panel game-finished">
      <span class="status-label">QUIZ TERMINÉ</span>
      <h2>${escapeHtml(soloQuiz.title)}</h2>
      <div class="solo-score"><strong>${soloScore} / ${total}</strong><span>${percentage} % de bonnes réponses</span></div>
      <button id="solo-again" class="button button-primary" type="button">Rejouer</button>
      <button id="solo-library" class="button button-secondary" type="button">Retour à la bibliothèque</button>
      <button id="solo-home" class="text-button" type="button">Retour à l’accueil</button>
    </div>`;
  document.querySelector("#solo-again").addEventListener("click", () => startSolo(soloQuiz));
  document.querySelector("#solo-library").addEventListener("click", () => {
    gameScreen.classList.add("hidden");
    homeScreen.classList.remove("hidden");
    openLibrary("solo");
  });
  document.querySelector("#solo-home").addEventListener("click", returnHome);
}

function createQuizRoom(quiz) {
  const name = document.querySelector("#host-name").value.trim();
  if (!name) {
    closeLibrary();
    document.querySelector("#host-name").focus();
    showError("Entre ton pseudo d’animateur pour créer une partie.");
    return;
  }
  socket.emit("create-room", {
    name,
    title: quiz.title,
    category: quiz.category,
    duration: quiz.duration,
    quiz: quiz.questions
  }, (result) => {
    if (result.error) {
      showError(result.error);
      return;
    }
    enterRoom(result.code, result.state, true, result);
  });
}

document.querySelector("#open-library").addEventListener("click", () => openLibrary("library"));
document.querySelector("#play-solo").addEventListener("click", () => openLibrary("solo"));

document.querySelector("#host-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showError("");
  const name = document.querySelector("#host-name").value;
  socket.emit("create-room", { name }, (result) => {
    if (result.error) return showError(result.error);
    enterRoom(result.code, result.state, true, result);
  });
});

document.querySelector("#join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showError("");
  const code = document.querySelector("#room-code").value;
  const name = document.querySelector("#player-name").value;
  socket.emit("join-room", { code, name }, (result) => {
    if (result.error) return showError(result.error);
    enterRoom(result.code, result.state, false);
  });
});

socket.on("room-state", (state) => {
  if (gameScreen.classList.contains("hidden")) return;
  showState(state);
});

socket.on("removed-from-room", () => {
  clearInterval(timerInterval);
  gameContent.innerHTML = '<div class="closed-message"><h2>Tu as été retiré de la partie</h2><p>Demande à l’animateur si tu souhaites rejoindre à nouveau.</p><button id="removed-home" class="button button-secondary" type="button">Retour à l’accueil</button></div>';
  document.querySelector("#removed-home").addEventListener("click", returnHome);
});

socket.on("room-closed", () => {
  clearInterval(timerInterval);
  gameContent.innerHTML = '<div class="closed-message"><h2>La partie est terminée</h2><p>L’animateur a quitté le salon.</p></div>';
});

function showState(state) {
  const questionIndex = state.question ? state.question.index : "";
  const viewKey = `${state.status}:${questionIndex}`;
  if (state.scoreboardVisible) showScoreboard(state.scoreboard);
  else hideScoreboard();
  if (viewKey === renderedRoomView && state.status === "question") {
    updateQuestionState(state);
    return;
  }
  renderedRoomView = viewKey;
  clearInterval(timerInterval);
  if (state.status === "lobby") renderLobby(state);
  else if (state.status === "question") renderQuestion(state);
  else if (state.status === "review") renderReview(state);
  else if (state.status === "paused") renderPaused(state);
  else if (state.status === "reveal") renderReveal(state);
  else if (state.status === "finished") renderResults(state);
}

function renderLobby(state) {
  const players = state.players.map((player) => `<span class="player-chip">${escapeHtml(player.name)}</span>`).join("");
  const joinHint = isHost
    ? `Partage le code avec tes joueurs. Le quiz comporte ${state.quizQuestionCount} questions.`
    : "Tu es dans la partie ! Garde cette page ouverte.";
  const action = isHost
    ? `<button id="start-game" class="button button-primary host-start" ${state.players.length < 1 ? "disabled" : ""}>Lancer le quiz <span>→</span></button>`
    : '<p class="waiting-note">L’animateur va bientôt lancer la partie…</p>';
  const qrCode = isHost && hostJoinQrCode && hostJoinUrl
    ? `<div class="join-qr">
        <img src="${escapeHtml(hostJoinQrCode)}" alt="QR code pour rejoindre la partie ${escapeHtml(currentCode)}">
        <p>Scanne ce QR code pour rejoindre</p>
        <a href="${escapeHtml(hostJoinUrl)}">${escapeHtml(hostJoinUrl)}</a>
      </div>`
    : "";
  gameContent.innerHTML = `
    <div class="lobby-panel">
      <span class="status-label">SALON D’ATTENTE</span>
      <h2>${escapeHtml(state.quizTitle || "La partie se prépare")}</h2>
      <p>${joinHint}</p>
      <div class="large-code">${escapeHtml(currentCode)}</div>
      <div class="join-hint">Rendez-vous sur cette page et entrez le code</div>
      ${qrCode}
      <div class="player-heading"><span>Dans la partie</span><span class="player-count">${state.players.length} joueur${state.players.length > 1 ? "s" : ""}</span></div>
      <div class="player-list">${players}</div>
      <div class="lobby-actions">${action}</div>
      ${isHost ? renderHostControls(state) : ""}
    </div>`;
  const startButton = document.querySelector("#start-game");
  if (startButton) startButton.addEventListener("click", () => {
    startButton.disabled = true;
    socket.emit("start-game", (result) => {
      if (result.error) startButton.disabled = false;
    });
  });
  if (isHost) bindHostControls(state);
}

const sharedRoomCode = new URLSearchParams(window.location.search).get("code");
if (sharedRoomCode) {
  document.querySelector("#room-code").value = sharedRoomCode.replace(/\D/g, "").slice(0, 6);
  document.querySelector("#player-name").focus();
}

function renderQuestion(state) {
  answered = false;
  const question = state.question;
  const isOpen = question.type === "open";
  const answers = isOpen
    ? `<form id="room-open-answer" class="open-answer-form">
        <label for="room-open-response">Ta réponse</label>
        <input id="room-open-response" maxlength="80" autocomplete="off" required>
        <button class="button button-primary" type="submit">Envoyer</button>
      </form>`
    : `<div class="answer-grid">${question.choices.map((choice, index) =>
        `<button class="answer-button" type="button" data-choice="${index}">${escapeHtml(choice)}</button>`
      ).join("")}</div>`;
  gameContent.innerHTML = `
    <div class="question-panel">
      <div class="question-meta"><span>QUESTION ${question.index + 1} / ${question.total}</span><span id="timer" class="timer">${question.seconds}</span></div>
      <div class="progress-track"><div id="progress" class="progress-fill"></div></div>
      <h2 class="question-text">${escapeHtml(question.text)}</h2>
      ${answers}
      ${isHost && isOpen ? '<div id="open-submissions" class="open-submissions"></div>' : ""}
      <p id="answer-status" class="answer-status">${isHost ? "" : "Choisis ta réponse avant la fin du temps !"}</p>
    </div>
    ${isHost ? renderHostControls(state) : ""}`;
  const buttons = [...document.querySelectorAll(".answer-button")];
  if (isHost) buttons.forEach((button) => { button.disabled = true; });
  else buttons.forEach((button) => button.addEventListener("click", () => submitAnswer(button, buttons)));
  if (isOpen && !isHost) {
    document.querySelector("#room-open-answer").addEventListener("submit", (event) => {
      event.preventDefault();
      submitOpenAnswer(document.querySelector("#room-open-response").value);
    });
  }
  updateQuestionState(state);

  let remaining = question.seconds;
  const timer = document.querySelector("#timer");
  const progress = document.querySelector("#progress");
  timerInterval = setInterval(() => {
    remaining = Math.max(remaining - 1, 0);
    timer.textContent = remaining;
    timer.classList.toggle("urgent", remaining <= 5);
    progress.style.transform = `scaleX(${remaining / question.seconds})`;
    if (remaining === 0) clearInterval(timerInterval);
  }, 1000);
}

function updateQuestionState(state) {
  if (!state.question) return;
  const answeredCount = state.players.filter((player) => player.answered).length;
  const status = document.querySelector("#answer-status");
  if (status) {
    status.textContent = isHost
      ? `${answeredCount} / ${state.players.length} joueur${state.players.length === 1 ? "" : "s"} ont répondu.`
      : state.players.find((player) => player.id === socket.id)?.answered
        ? "Réponse envoyée. Encore un peu de patience…"
        : "Choisis ta réponse avant la fin du temps !";
  }
  if (isHost && state.question.type === "open") {
    const submissions = gameContent.querySelector("#open-submissions");
    if (submissions) {
      submissions.innerHTML = renderOpenSubmissions(state.question.submissions || []);
      bindReviewButtons(submissions);
    }
  }
  if (!isHost && state.players.some((player) => player.id === socket.id && player.answered)) {
    gameContent.querySelectorAll(".answer-button, #room-open-response, #room-open-answer button")
      .forEach((element) => { element.disabled = true; });
  }
  if (isHost) refreshHostControls(state);
}

function submitAnswer(button, buttons) {
  if (answered) return;
  answered = true;
  buttons.forEach((item) => { item.disabled = true; });
  document.querySelector("#answer-status").textContent = "Réponse envoyée. Encore un peu de patience…";
  socket.emit("submit-answer", Number(button.dataset.choice), (result) => {
    if (result.error) {
      answered = false;
      document.querySelector("#answer-status").textContent = result.error;
      buttons.forEach((item) => { item.disabled = false; });
    }
  });
}

function submitOpenAnswer(value) {
  if (answered) return;
  const response = value.trim();
  if (!response) return;
  answered = true;
  document.querySelector("#room-open-response").disabled = true;
  document.querySelector("#room-open-answer button").disabled = true;
  document.querySelector("#answer-status").textContent = "Réponse envoyée. Encore un peu de patience…";
  socket.emit("submit-answer", response, (result) => {
    if (result.error) {
      answered = false;
      document.querySelector("#answer-status").textContent = result.error;
      document.querySelector("#room-open-response").disabled = false;
      document.querySelector("#room-open-answer button").disabled = false;
    }
  });
}

function renderReview(state) {
  const submissions = state.question.submissions || [];
  gameContent.innerHTML = `
    <div class="question-panel">
      <div class="question-meta"><span>VALIDATION · QUESTION ${state.question.index + 1} / ${state.question.total}</span><span id="timer" class="timer">${state.question.seconds}</span></div>
      <h2 class="question-text">${escapeHtml(state.question.text)}</h2>
      <p>Valide les réponses des joueurs.</p>
      <div id="open-submissions" class="open-submissions">${renderOpenSubmissions(submissions)}</div>
    </div>
    ${isHost ? renderHostControls(state) : '<p class="waiting-note">L’animateur valide les réponses…</p>'}`;
  bindReviewButtons(gameContent);
  if (isHost) bindHostControls(state);
  startTimer(state.question.seconds);
}

function renderOpenSubmissions(submissions) {
  return submissions.length ? submissions.map((submission) => `
    <article class="open-submission">
      <strong>${escapeHtml(submission.name)}</strong>
      <p>${escapeHtml(submission.response)}</p>
      ${submission.reviewed ? `<span class="review-result">${submission.responseCorrect ? "Bonne réponse" : "Incorrecte"}</span>` : `
        <div class="host-control-buttons">
          <button class="button button-primary" type="button" data-review-player="${escapeHtml(submission.id)}" data-correct="true">Bonne réponse</button>
          <button class="button button-danger" type="button" data-review-player="${escapeHtml(submission.id)}" data-correct="false">Incorrecte</button>
        </div>`}
    </article>`).join("") : '<p class="waiting-note">Les joueurs peuvent encore répondre.</p>';
}

function bindReviewButtons(container) {
  container.querySelectorAll("[data-review-player]").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("review-answer", {
        playerId: button.dataset.reviewPlayer,
        correct: button.dataset.correct === "true"
      }, showHostActionResult);
    });
  });
}

function renderPaused(state) {
  gameContent.innerHTML = `
    <div class="question-panel">
      <span class="status-label">PARTIE EN PAUSE</span>
      <h2 class="question-text">${escapeHtml(state.question?.text || "La partie est en pause.")}</h2>
      <p>Le chronomètre est arrêté.</p>
    </div>
    ${isHost ? renderHostControls(state) : '<p class="waiting-note">L’animateur a mis la partie en pause.</p>'}`;
  if (isHost) bindHostControls(state);
}

function renderHostControls(state) {
  const active = ["question", "review", "reveal", "paused"].includes(state.status);
  const controls = [];
  if (["question", "review", "reveal"].includes(state.status)) {
    controls.push('<button class="button button-secondary" type="button" data-host-action="pause-game">Mettre en pause</button>');
  } else if (state.status === "paused") {
    controls.push('<button class="button button-primary" type="button" data-host-action="resume-game">Reprendre</button>');
  }
  if (active) controls.push('<button class="button button-secondary" type="button" data-host-action="skip-question">Passer la question</button>');
  if (active && state.status !== "paused") {
    controls.push(`<button class="button button-secondary" type="button" data-host-action="toggle-scoreboard">${state.scoreboardVisible ? "Masquer le classement" : "Afficher le classement"}</button>`);
  }
  if (state.status !== "finished") {
    controls.push('<button class="button button-danger" type="button" data-host-action="end-game">Terminer la partie</button>');
  }
  const players = state.players.length && state.status !== "finished"
    ? `<details class="remove-player-list"><summary>Retirer un joueur</summary>${state.players.map((player) =>
        `<button class="remove-player-button" type="button" data-remove-player="${escapeHtml(player.id)}">${escapeHtml(player.name)} · retirer</button>`
      ).join("")}</details>`
    : "";
  return `<section class="host-controls" aria-label="Commandes de l’animateur">
    <strong>Commandes de l’animateur</strong>
    <div class="host-control-buttons">${controls.join("")}</div>
    ${players}
    <p class="host-action-error" role="alert"></p>
  </section>`;
}

function refreshHostControls(state) {
  const current = gameContent.querySelector(".host-controls");
  if (!current) return;
  current.outerHTML = renderHostControls(state);
  bindHostControls(state);
}

function bindHostControls(state) {
  gameContent.querySelectorAll("[data-host-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.hostAction;
      if (action === "end-game" && !window.confirm("Terminer cette partie pour tout le monde ?")) return;
      button.disabled = true;
      socket.emit(action, showHostActionResult);
    });
  });
  gameContent.querySelectorAll("[data-remove-player]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm(`Retirer ${button.textContent.replace(" · retirer", "")} de la partie ?`)) return;
      button.disabled = true;
      socket.emit("remove-player", button.dataset.removePlayer, showHostActionResult);
    });
  });
}

function showHostActionResult(result) {
  if (result?.error) {
    const error = gameContent.querySelector(".host-action-error");
    if (error) error.textContent = result.error;
  }
}

function showScoreboard(scores = []) {
  const overlay = document.querySelector("#scoreboard-overlay");
  if (!overlay) return;
  const rows = scores.slice(0, 5).map((player, index) =>
    `<span>${index + 1}. ${escapeHtml(player.name)} · ${player.score.toLocaleString("fr-FR")} pts</span>`
  ).join("");
  overlay.innerHTML = `<strong>Classement</strong>${rows || "<span>Pas encore de score.</span>"}`;
  overlay.classList.remove("hidden");
}

function hideScoreboard() {
  document.querySelector("#scoreboard-overlay")?.classList.add("hidden");
}

function startTimer(seconds) {
  const timer = document.querySelector("#timer");
  if (!timer) return;
  let remaining = seconds;
  timerInterval = setInterval(() => {
    remaining = Math.max(remaining - 1, 0);
    timer.textContent = remaining;
    timer.classList.toggle("urgent", remaining <= 5);
    if (remaining === 0) clearInterval(timerInterval);
  }, 1000);
}

function renderReveal(state) {
  const question = state.question;
  const players = state.players.filter((player) => player.id !== undefined);
  gameContent.innerHTML = `
    <div class="result-panel">
      <span class="status-label">RÉPONSE RÉVÉLÉE</span>
      <h2>Bien joué !</h2>
      <p>${escapeHtml(question.choices[question.correctAnswer])} était la bonne réponse.</p>
      <div class="score-list">${players.map((player, index) => `
        <div class="score-row"><span>${index + 1}. ${escapeHtml(player.name)}</span><span>${player.score.toLocaleString("fr-FR")} pts</span></div>
      `).join("")}</div>
      <p class="waiting-note">La prochaine question arrive bientôt…</p>
    </div>
    ${isHost ? renderHostControls(state) : ""}`;
  if (isHost) bindHostControls(state);
  if (state.scoreboardVisible) showScoreboard(state.scoreboard);
}

function renderResults(state) {
  const scores = state.leaderboard || [];
  const winner = scores[0];
  const rows = scores.map((player, index) => `
    <div class="score-row"><span>${index === 0 ? "✦ " : ""}${index + 1}. ${escapeHtml(player.name)}</span><span>${player.score.toLocaleString("fr-FR")} pts</span></div>
  `).join("");
  gameContent.innerHTML = `
    <div class="result-panel">
      <span class="status-label">FIN DE LA PARTIE</span>
      <h2>${winner ? `Bravo ${escapeHtml(winner.name)} !` : "Merci d’avoir joué !"}</h2>
      <p>Voici le classement final de la partie.</p>
      <div class="score-list">${rows || '<p class="waiting-note">Aucun joueur dans le classement.</p>'}</div>
      <button id="back-home" class="button button-secondary" type="button">Retour à l’accueil</button>
    </div>`;
  document.querySelector("#back-home").addEventListener("click", returnHome);
  hideScoreboard();
}

function returnHome() {
  clearInterval(timerInterval);
  gameScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
  document.querySelector("#game-mode-label").textContent = "PARTIE";
  document.querySelector("#active-code").textContent = "";
  gameContent.innerHTML = "";
  currentCode = "";
  isHost = false;
  renderedRoomView = "";
  hideScoreboard();
}
