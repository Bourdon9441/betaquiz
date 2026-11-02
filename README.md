# quizbeta

quizbeta est un jeu de quiz multijoueur en temps réel, avec une bibliothèque de quiz et un mode solo.

## Lancer le jeu

1. Installe Node.js.
2. Dans ce dossier, lance `npm install`.
3. Lance `npm start`.
4. Ouvre `http://localhost:3000` dans un navigateur.

L’animateur partage le code de la partie avec les joueurs. Si le site est ouvert sur `localhost`, le serveur choisit une adresse IPv4 locale pour les liens de participation. Autorise Node.js sur le réseau privé si le pare-feu Windows le demande.

L’animateur organise la partie mais ne joue pas : il n’apparaît ni dans la liste des joueurs ni dans le classement. Au moins un joueur doit rejoindre avant de pouvoir démarrer.

La bibliothèque contient cinq quiz intégrés et permet de rechercher par titre, catégorie ou question. Depuis un quiz, tu peux démarrer une partie en solo ou créer un salon multijoueur.

Le mode solo se joue sans salon multijoueur ni minuterie. Après chaque réponse, le jeu indique si elle est correcte, puis affiche le score et le pourcentage final.

Les salons de jeu sont conservés en mémoire et disparaissent lorsque le serveur s’arrête. Les quiz partagés par l’API du serveur sont enregistrés dans `data/shared-quizzes.json`.

## Licence

Ce projet est distribué sous licence MIT. Consulte le fichier [LICENSE](./LICENSE) pour les conditions.
