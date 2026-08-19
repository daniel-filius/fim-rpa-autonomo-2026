# Fim do RPA 2026 — Decisor PF, MEI ou Simples Nacional

**Site:** https://daniel-filius.github.io/fim-rpa-autonomo-2026/

Ferramenta gratuita para autônomos pessoa física que precisam decidir como se adaptar à
Reforma Tributária de 2026:

- **NFS-e Nacional obrigatória** desde 1º de janeiro de 2026 para quem presta serviço de
  forma habitual como autônomo.
- **Inscrição no CNPJ** obrigatória a partir de julho de 2026 para contribuintes de
  IBS/CBS (não significa abrir empresa).

O decisor compara três caminhos lado a lado — continuar como PF emitindo NFS-e, virar
MEI ou abrir Simples Nacional (Anexo III/V, com Fator R) — e estima a carga tributária de
cada um a partir do perfil informado (tipo de cliente, faturamento anual, recorrência).
Inclui checklist da transição e aviso sobre risco de pejotização quando o cliente é único
ou recorrente.

## Stack

- `index.html` + `calc.js` — decisor client-side, sem backend, sem coleta de dados além do
  formulário opcional de contato (FormSubmit).
- `test_calc.js` — suíte de 42 asserts cobrindo Carnê-Leão, Simples Anexo III/V, Fator R e
  elegibilidade ao MEI (limite de faturamento, tolerância de 20%, atividades vedadas do
  Anexo XI). Rodar com `node test_calc.js`.
- Deploy: GitHub Pages (estático, custo zero).

## Aviso

Estimativas informativas, não substituem aconselhamento contábil. Fontes: Ministério da
Fazenda, Receita Federal e legislação da Reforma Tributária (Resolução CGSN 140/2018).
