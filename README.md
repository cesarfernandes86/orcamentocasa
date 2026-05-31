# Orcamento da Casa

Aplicativo HTML estatico para controlar o orcamento mensal da casa.

## Como usar

Abra `index.html` no navegador. O app salva em `localStorage` automaticamente, mesmo sem Firebase.

Principais funcoes:

- renda mensal;
- custos fixos;
- custos fixos copiados para meses seguintes apenas com o nome;
- custos variaveis;
- itens que recebem uma porcentagem do saldo restante;
- itens por porcentagem copiados para meses seguintes com nome e porcentagem;
- campo de valor usado em cada item por porcentagem, com calculo do restante;
- alerta quando as porcentagens passam de 100%;
- exportacao e importacao JSON;
- sincronizacao opcional com Cloud Firestore.

## Ligar ao Firebase

O app ja esta configurado para o projeto `orcamento-casa-9ce51`.

Para a sincronizacao funcionar:

1. Ative Cloud Firestore no Firebase.
2. Ative Authentication com login anonimo.
3. Abra o app, confirme o ID da casa e clique em `Conectar Firebase`.

O codigo que o Firebase mostra com `import { initializeApp } from "firebase/app"` e pensado para projetos com npm/bundler. Este app e HTML estatico, entao usa os modulos do Firebase via CDN em `app.js`.

Exemplo de formato:

```json
{
  "apiKey": "SUA_API_KEY",
  "authDomain": "seu-projeto.firebaseapp.com",
  "projectId": "seu-projeto",
  "appId": "1:000000000000:web:0000000000000000000000"
}
```

## Regras iniciais do Firestore

Para um prototipo simples com login anonimo, voce pode usar:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{householdId}/months/{monthId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Para uso real com dados financeiros, o ideal e evoluir para contas de usuario e permissoes por familia.
