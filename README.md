# Fusion Conseil

Aide de jeu pour la **Forge des reliques** d'Endless Frontier 2 : lit l'écran du jeu et conseille le meilleur coup
(placement, rotation, marteau), en tenant compte du point blanc qui indique où la fusion aura lieu.

## Android
1. Ouvre la page [Releases](../../releases/tag/latest) depuis le téléphone et télécharge `FusionConseil.apk`.
2. Installe-le (Android demande d'autoriser l'installation depuis le navigateur).
3. Lance « Fusion Conseil », touche **Démarrer**, accepte l'affichage par-dessus les autres applis et la capture d'écran.
4. Ouvre le jeu, place la petite fenêtre en haut de l'écran (hors plateau et pièces), touche ⚙ puis **Calibrer**.

Chaque modification poussée sur `main` recompile l'APK automatiquement (GitHub Actions) et met à jour la release `latest`.

## PC
Ouvre `web/fusion_conseil.html` dans Chrome ou Edge, puis « Choisir la fenêtre du jeu ».

## Structure
- `web/core.js` : lecture de l'écran et solveur (partagé PC / Android)
- `web/ui.html` : interface ; `web/build.py` assemble `fusion_conseil.html`
- `app/` : appli Android (capture d'écran + fenêtre flottante affichant la page)
