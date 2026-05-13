**Full Project Creation Workflow**

1. User logs in with GitHub
2. User creates a new project and gives it a name
3. This immediately triggers the full **Environment Setup** on Render:
   - Create new workspace under `nebula.dev.ai@gmail.com`
   - Create project + project ID
   - Create PostgreSQL database and get `DATABASE_URL`
   - Copy all Platform Variables
   - Generate `SESSION_SECRET`
   - Set correct GitHub callback URL
   - Store workspace ID and project ID internally
4. Grok Chat begins asking the user questions to understand the project
5. Generate Master Plan
6. Generate Mind Map
7. Trigger Pencil for UI mockups
8. Grok reads all reference files in this exact order: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `nebula-sysh-ui-sysh-studio.md` → `project-execution-rules.md` (and reviews Secrets and Integrations for the active project)
9. Grok creates a summary of the project, tech stack, and any missing pieces
10. If anything is missing, Grok asks the user before coding
11. Only then does Grok start development following the rules in this file
