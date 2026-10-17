import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrPhone } from '../src/common/phone';
import { formatDate, formatMoney, normalizeKeyword, resolveDynamicValue, firstName, toIxcValue } from '../src/common/text';
import { insideAnyArea, parseCoord } from '../src/common/geo';
import { componentsInfo, countVars, draftIssues, renderText } from '../src/templates/template-utils';

test('normaliza telefones brasileiros', () => {
  assert.equal(normalizeBrPhone('(11) 98765-4321'), '+5511987654321');
  assert.equal(normalizeBrPhone('5511987654321'), '+5511987654321');
  assert.equal(normalizeBrPhone('+55 (61) 9 9999-0000'), '+5561999990000');
  assert.equal(normalizeBrPhone('6188887777'), '+5561988887777'); // adiciona nono dígito
  assert.equal(normalizeBrPhone('6133334444'), '+556133334444'); // fixo continua igual
  assert.equal(normalizeBrPhone('98765-4321', '61'), '+5561987654321');
  assert.equal(normalizeBrPhone('0 15 61 98765-4321'), '+5561987654321'); // com operadora
  assert.equal(normalizeBrPhone(''), null);
  assert.equal(normalizeBrPhone('123'), null);
  assert.equal(normalizeBrPhone('0000000000'), null);
});

test('formatações', () => {
  assert.equal(formatDate('2026-10-16'), '16/10/2026');
  assert.equal(formatMoney('99.9').replace(/\s/g, ' '), 'R$ 99,90');
  assert.equal(normalizeKeyword('  Sair! '), 'SAIR');
  assert.equal(normalizeKeyword('não'), 'NAO');
  assert.equal(firstName('MARIA DA SILVA'), 'Maria');
  assert.equal(resolveDynamicValue('@hoje-5', new Date(2026, 9, 16)), '2026-10-11');
  assert.equal(resolveDynamicValue('@hoje', new Date(2026, 0, 1)), '2026-01-01');
  assert.equal(resolveDynamicValue('S'), 'S');
});

test('seleção por área no mapa', () => {
  assert.equal(parseCoord('-15,7801'), -15.7801);
  assert.equal(parseCoord(''), null);
  assert.equal(parseCoord('0'), null);
  const square = { type: 'Polygon' as const, coordinates: [[[-48, -16], [-47, -16], [-47, -15], [-48, -15], [-48, -16]]] };
  assert.equal(insideAnyArea(-15.5, -47.5, [square]), true);
  assert.equal(insideAnyArea(-14.5, -47.5, [square]), false);
  const circle = { type: 'Circle' as const, center: [-47.9, -15.8] as [number, number], radius: 1000 };
  assert.equal(insideAnyArea(-15.805, -47.9, [circle]), true); // ~550 m
  assert.equal(insideAnyArea(-15.82, -47.9, [circle]), false); // ~2,2 km
  assert.equal(insideAnyArea(-14.5, -47.5, [square, { ...circle, center: [-47.5, -14.5] }]), true);
});

test('leitura de modelos', () => {
  assert.equal(countVars('Olá {{1}}, sua fatura de {{2}} vence {{3}}.'), 3);
  assert.equal(renderText('Olá {{1}}!', { '1': 'Ana' }), 'Olá Ana!');
  const info = componentsInfo([
    { type: 'HEADER', format: 'IMAGE' },
    { type: 'BODY', text: 'Oi {{1}}, veja {{2}}.' },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sair' }, { type: 'URL', text: 'Ver', url: 'https://x.com/{{1}}' }] },
  ]);
  assert.equal(info.headerFormat, 'IMAGE');
  assert.equal(info.bodyVars, 2);
  assert.deepEqual(info.dynamicUrlButtons, [1]);
});

test('valores de filtro no formato do IXC', () => {
  assert.equal(toIxcValue('2026-10-16'), '16/10/2026');
  assert.match(toIxcValue('@hoje-5'), /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(toIxcValue('S'), 'S');
  assert.equal(toIxcValue('CM,CA'), 'CM,CA');
  assert.equal(toIxcValue('2024-03-14 10:00:00'), '2024-03-14 10:00:00'); // data e hora fica como está
});

test('bloqueio de tentativas de login', async () => {
  const { assertNotLocked, registerFailure, registerSuccess } = await import('../src/auth/login-limiter');
  const t0 = 1_000_000;
  for (let i = 0; i < 7; i++) registerFailure('a@x.com', '1.1.1.1', t0);
  assert.doesNotThrow(() => assertNotLocked('a@x.com', '1.1.1.1', t0));
  registerFailure('a@x.com', '1.1.1.1', t0);
  assert.throws(() => assertNotLocked('a@x.com', '1.1.1.1', t0), /Muitas tentativas/);
  assert.doesNotThrow(() => assertNotLocked('outro@x.com', '2.2.2.2', t0)); // outros usuários seguem entrando
  assert.doesNotThrow(() => assertNotLocked('a@x.com', '1.1.1.1', t0 + 16 * 60 * 1000)); // libera após 15 min
  registerFailure('b@x.com', '3.3.3.3', t0);
  registerSuccess('b@x.com');
  assert.doesNotThrow(() => assertNotLocked('b@x.com', '3.3.3.3', t0));
});

test('regras da Meta para rascunhos de modelo', () => {
  const base = { name: 'aviso_manutencao', category: 'UTILITY' as const, headerText: null, footer: null, buttons: [] as any[] };
  const ok = draftIssues({ ...base, body: 'Olá, {{1}}! Faremos uma manutenção na rede na quinta, das 2h às 5h. Pedimos desculpas pelo transtorno.', examples: ['Maria'] });
  assert.deepEqual(ok.filter((i) => i.severity !== 'dica'), []);
  const probs = (body: string, extra: object = {}) => draftIssues({ ...base, body, examples: ['a', 'b'], ...extra }).map((i) => i.problem).join(' | ');
  assert.match(probs('{{1}}, sua fatura vence amanhã, não esqueça de pagar a tempo.'), /começa com uma variável/);
  assert.match(probs('Olá, sua fatura de valor alto vence amanhã, {{1}}'), /termina com uma variável/);
  assert.match(probs('Olá {{1}} {{2}}, sua fatura vence amanhã e já está disponível.'), /Duas variáveis seguidas/);
  assert.match(probs('Olá {{2}}, sua fatura vence amanhã e já está disponível no app.'), /falta \{\{1\}\}/);
  assert.match(probs('Olá {{1}}, pague pelo link bit.ly/abc123 e evite o bloqueio do seu plano.'), /encurtado/);
  assert.match(probs('Olá {{1}}, conheça o novo plano de 1 Giga com preço especial para você.', { category: 'MARKETING' }), /descadastro/);
  assert.doesNotMatch(
    probs('Olá {{1}}, conheça o novo plano de 1 Giga com preço especial para você.', { category: 'MARKETING', buttons: [{ type: 'QUICK_REPLY', text: 'Sair' }] }),
    /descadastro/,
  );
  assert.match(probs('Oi {{1}}, veja.', {}), /Muitas variáveis/);
});
