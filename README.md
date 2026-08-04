# Sistema Web de Auditorias Internas — AFPESP

Aplicação web local para planejamento, execução, registro e emissão de relatórios de auditorias internas do Sistema de Gestão da Qualidade.

## Tecnologias

- React, TypeScript e Vite
- Tailwind CSS e React Router
- Dexie/IndexedDB (sem backend)
- Chart.js
- Exportação Excel (`xlsx`) e Word (`docx`)
- Publicação automática pelo GitHub Pages

## Execução local

```bash
npm install
npm run dev
```

## Compilação

```bash
npm run build
```

Os dados são armazenados exclusivamente no navegador utilizado. O módulo de backup permite exportar e restaurar todos os cadastros, auditorias, respostas e evidências fotográficas.
