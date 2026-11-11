---
tipo: devlog_evolucao
projeto: CaptaOSC
versao: 3.0.0
data: "11/11/2026"
tags:
  - captaosc
  - devlog
  - evolucao_software
  - mrosc
  - transferegov
---

# 📌 Diário de Bordo CaptaOSC: Pesquisa de Politicas Publicas Ministeriais e Distincao Impositivo vs Discricionario

> [!INFO] Ficha da Evolução
> - **Projeto:** CaptaOSC (MROSC & Transferegov)
> - **Data de Registro:** 11/11/2026 às 10:57:02
> - **Ambiente:** Antigravity Local

## 🎯 Escopo da Evolução
Separação do domínio de captação de recursos (OSC) do diário de bordo do desenvolvedor (Obsidian).

## 🏗️ Decisões de Arquitetura
1. **Domínio da OSC:** Frontend e endpoints voltados estritamente à captação de emendas parlamentares, validação do Art. 33/39 do MROSC e cálculos orçamentários de GND 3 (Custeio) vs GND 4 (Capital).
2. **Domínio de Gestão / Obsidian:** O Obsidian atua como repositório de documentação viva, changelog e acompanhamento do desenvolvimento do software, isolado do operador da entidade social.

---
*Gerado via script de governança CaptaOSC.*
