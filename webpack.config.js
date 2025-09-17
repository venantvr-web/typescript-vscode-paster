//@ts-check

'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
    target: 'node', // Les extensions VS Code s'exécutent dans un environnement de type Node.js
    mode: 'none', // 'production' ou 'development' selon le besoin

    entry: './src/extension.ts', // <-- LE POINT CLÉ : On indique le fichier exact comme point d'entrée
    output: {
        // Le bundle est écrit dans le dossier 'dist'
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    devtool: 'nosources-source-map',
    externals: {
        vscode: 'commonjs vscode' // Le module 'vscode' est fourni par l'environnement de l'extension, il ne doit pas être inclus dans le bundle
    },
    resolve: {
        // Permet de résoudre les imports de fichiers .ts et .js
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    }
};
module.exports = config;