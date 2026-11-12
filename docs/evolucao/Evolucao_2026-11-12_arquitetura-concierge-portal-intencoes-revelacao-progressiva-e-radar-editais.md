---
tipo: devlog_evolucao
projeto: CaptaOSC
versao: 4.0.0
data: "12/11/2026"
tags:
  - captaosc
  - devlog
  - evolucao_software
  - mrosc
  - concierge
  - progressive_disclosure
  - radar_editais
  - mapa_osc
  - transferegov
---

# 📌 Diário de Bordo CaptaOSC: Arquitetura de Concierge, Portal de Intenções, Revelação Progressiva e Radar Nacional de Editais

> [!INFO] Ficha da Evolução
> - **Projeto:** CaptaOSC (MROSC & Transferegov.br)
> - **Versão:** 4.0.0
> - **Data de Registro:** 12/11/2026
> - **Ambiente:** Antigravity Local / Node.js :3000
> - **Repositório GitHub:** `marcelofernandesgarcia-dev/CAPTAOSC`

---

## 🎯 Escopo da Evolução

Transformação completa do CaptaOSC de um "depósito de 8 ferramentas" em um **Mentor de Jornada**, aplicando:
1. **Arquitetura de Concierge (Triagem Inteligente):** Entrada pelo *Portal de Intenções* com 3 caminhos bem definidos (*Minha Regularidade*, *Buscador de Recursos & Editais*, *Criador de Projetos & Ofícios*).
2. **Modo Foco da Missão:** Ocultação do menu denso de 8 abas durante a execução, exibindo apenas o cabeçalho focado e a barra de passos da missão ativa (`Passo 1 > Passo 2 > Passo 3`).
3. **Revelação por Conquista (Just-in-Time):** Desbloqueio contextual de módulos complementares (Trilha Transferegov e Ciclo TCE) apenas quando o usuário conclui o diagnóstico ou emite o ofício.
4. **Revelação Progressiva em 3 Camadas:** Seletor de densidade técnica (Iniciante, Gestor, Jurídico/Técnico) com persistência em `localStorage` e animações táteis suaves.
5. **Radar Nacional de Editais Abertos:** Consumo em tempo real da API pública unificada da **Central de Editais Prosas** e do **Mapa das OSC (IPEA / Presidência da República)**, com cache em memória (TTL 1h), contagem regressiva de prazos e botão para carregar edital diretamente no Elaborador do Pleito.

---

## 🏗️ Decisões de Arquitetura & Implementação

1. **Portal de Intenções (`#portal-intencoes`):**
   - Substituição da tela inicial sobrecarregada por uma sala de triagem limpa.
   - O menu de navegação de 8 abas é mantido recolhido por padrão, acessível via botão *Modo Livre*.
2. **Backend Proxy & Cache (`server.js`):**
   - Rota `/api/editais/radar` que orquestra requisições paginadas à API do Prosas/IPEA, sanitiza links, calcula dias restantes e armazena em cache de 1 hora.
3. **UX Writing e Micro-Cópia Atenciosa:**
   - Remoção de terminologias frias; substituição de "dinheiro" por "recursos" e nomes de engenharia por frases de ação (*"Quero saber se minha ONG está regular"*, *"Preciso de recursos para um novo projeto"*, *"Já tenho emenda/edital e preciso documentar"*).

---

## 🚀 Status da Entrega
- Testado localmente em `http://localhost:3000` com status 200 e zero erros de console.
- Sincronizado e versionado no repositório GitHub `marcelofernandesgarcia-dev/CAPTAOSC`.
