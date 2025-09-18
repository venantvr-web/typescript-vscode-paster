# LLM Paster : Intégrez des Patches de Code Multi-fichiers avec Prévisualisation et Comparaison

Intégrez en toute sécurité les suggestions de code multi-fichiers de vos assistants IA (ChatGPT, Claude, Copilot, etc.) dans votre espace de travail VSCode. Ne copiez-collez plus à l'aveugle : prévisualisez, comparez les différences ligne par ligne et appliquez les changements en un clic.

## Fonctionnalités Clés

  * **Prévisualisation des Modifications** : Avant d'appliquer les changements, obtenez un résumé clair des fichiers qui seront **créés** ou **modifiés**, vous donnant un contrôle total sur l'opération. (implémenté dans la fonction `previewChanges` de `src/extension.ts`)
  * **Comparaison Visuelle (Diff) Intégrée** : Pour chaque fichier existant, ouvrez une vue "diff" native de VSCode pour inspecter précisément les changements. Cette fonctionnalité repose sur un fournisseur de contenu virtuel pour comparer le fichier sur disque avec le patch proposé avant qu'il ne soit appliqué. (implémenté via `DiffContentProvider` dans `src/extension.ts`)
  * **Analyse Intelligente du Contenu Collé** : Détecte et analyse automatiquement les blocs de code structurés avec les marqueurs `File:` et `Content:` pour gérer des mises à jour complexes sur plusieurs fichiers en une seule fois. (implémenté dans la fonction `parseInputText` de `src/extension.ts`)
  * **Interface Utilisateur Simple** : Lancez l'outil depuis un bouton dédié `$(paste) LLM Paster` dans la barre de statut ou via la palette de commandes pour un accès rapide et une expérience fluide. (implémenté dans la fonction `activate` de `src/extension.ts`)

## Comment ça marche ?

1.  Cliquez sur le bouton **`LLM Paster`** dans la barre de statut (en bas à droite) ou utilisez la Palette de Commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`) pour trouver et lancer `LLM Paste and Replace Code`.
2.  Dans l'onglet qui s'ouvre, collez le code généré par votre LLM.
3.  Cliquez sur le bouton **"Preview Changes"**. Une liste des fichiers à créer ou modifier apparaît.
4.  Pour un fichier qui sera **modifié**, cliquez sur le bouton "Diff" à côté de son nom pour ouvrir une vue de comparaison détaillée.
5.  Lorsque vous êtes satisfait des changements, cliquez sur **"Create / Update Files"** pour les appliquer à votre espace de travail.

## Format Attendu

Pour que l'extension puisse analyser le contenu, utilisez un format simple où chaque bloc de fichier commence par `File:` suivi du chemin, et `Content:` sur la ligne suivante.

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
3.  L'icône `$(paste) LLM Paster` apparaîtra dans la barre de statut, prête à être utilisée.

## Prérequis

  * **Visual Studio Code** (version 1.80.0 ou supérieure).
  * Un **dossier de travail** doit être ouvert pour que l'extension puisse lire et écrire des fichiers.

## Licence

Ce projet est sous licence **MIT**.
