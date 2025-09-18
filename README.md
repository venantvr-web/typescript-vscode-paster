# LLM Paster : Appliquer des Patches de Code avec Prévisualisation et Diff

Intégrez en toute sécurité les suggestions de code multi-fichiers de vos assistants IA (ChatGPT, Claude, Copilot, etc.) dans votre espace de travail VSCode. Ne copiez-collez plus à l'aveugle : prévisualisez, comparez les différences et appliquez les changements en un clic.

## Fonctionnalités Clés

L'analyse du code (`extension.ts`) révèle des fonctionnalités avancées qui vont au-delà d'un simple collage :

  - **Prévisualisation Intégrée** : Avant d'appliquer les changements, obtenez un résumé clair des fichiers qui seront **créés** ou **modifiés**.
  - **Comparaison Visuelle (Diff)** : Pour chaque fichier modifié, ouvrez une vue "diff" native de VSCode pour inspecter précisément les changements ligne par ligne.
  - **Opérations par Lot** : Créez ou mettez à jour des dizaines de fichiers en une seule opération.
  - **Interface Dédiée** : Une vue web (`Webview`) claire pour coller votre code et visualiser les actions.
  - **Analyse Intelligente** : Détecte automatiquement les chemins de fichiers et les blocs de contenu à partir du texte collé.
  - **Accès Rapide** : Lancez l'outil depuis la barre de statut (`$(paste) LLM Paster`) ou la palette de commandes.
  - **Gestion des Erreurs** : Recevez des retours clairs en cas de format invalide ou de problème lors de l'analyse.

## Comment ça marche ?

1.  Cliquez sur le bouton **`LLM Paster`** dans la barre de statut (en bas à droite) ou utilisez la Palette de Commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`) → `LLM Paste and Replace Code`.
2.  Dans l'onglet qui s'ouvre, collez le code généré par votre LLM.
3.  Cliquez sur **"Preview Changes"**. Une liste des fichiers à créer ou modifier apparaît.
4.  **(Optionnel)** Pour un fichier qui sera **modifié**, cliquez sur le bouton "Diff" à côté de son nom pour ouvrir une vue de comparaison détaillée.
5.  Lorsque vous êtes satisfait, cliquez sur **"Create / Update Files"** pour appliquer les changements à votre espace de travail.

## Format Attendu

Utilisez un format simple et lisible pour que l'extension puisse analyser le contenu. Chaque bloc de fichier doit commencer par `File:` suivi du chemin, et `Content:` sur la ligne suivante.

```
File: src/components/Button.tsx
Content:
export const Button = ({ label, onClick }) => {
  return <button className="button" onClick={onClick}>{label}</button>
}

File: src/styles/button.css
Content:
.button {
  padding: 10px 20px;
  border-radius: 4px;
  background-color: #007bff;
  color: white;
}
```

## Installation

1.  Installez l'extension depuis la [Marketplace VSCode](https://marketplace.visualstudio.com) ou via un fichier `VSIX`.
2.  Ouvrez un dossier ou un espace de travail dans VSCode.
3.  Commencez à utiliser l'extension \!

## Prérequis

  - VSCode version 1.80.0 ou supérieure.
  - Un dossier doit être ouvert dans l'espace de travail.

## Licence

MIT
