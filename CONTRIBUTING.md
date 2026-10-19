# Contribuer à Nexus (local-agents)

Merci de vouloir améliorer Nexus. Signaler un bug, proposer une idée, améliorer un agent ou la documentation : toute aide est bienvenue.

## Signaler un bug ou proposer une idée

Ouvrez une [issue](https://github.com/loic31000/local-agents/issues/new/choose) avec le modèle qui convient. Précisez votre système, votre GPU et le modèle Ollama utilisé. N'y mettez jamais de jeton Discord, de clé API, de mot de passe ni de conversation privée.

## Proposer une modification

1. Forkez le dépôt et créez une branche à partir de `main`.
2. Gardez la modification ciblée : un correctif ou une fonctionnalité par pull request.
3. Lancez les vérifications :

```bash
go test ./tests/unit/...

# Si l'interface change, dans frontend/
npm run build
```

Les tests d'intégration et de bout en bout (`tests/integration`, `tests/e2e`) demandent que les services tournent (`just start`).

4. Ouvrez une pull request qui explique ce que vous changez et pourquoi.

## Règles du projet

- **100 % local** : aucune dépendance obligatoire à un service cloud. Ollama tourne sur l'hôte, Docker sert à l'orchestrateur et aux agents.
- **Secrets** : la configuration sensible reste dans `.env`, jamais dans le dépôt.

## Code de conduite

Ce projet suit le [code de conduite Contributor Covenant](CODE_OF_CONDUCT.md).
