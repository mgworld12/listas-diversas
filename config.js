export const DEFAULTS = {
  sectors: [
    { id: 'farmacia', name: 'FARMÁCIA', icon: '💊', color: '#10b981' },
    { id: 'mercado', name: 'MERCADO', icon: '🛒', color: '#f59e0b' },
    { id: 'escritorio', name: 'ESCRITÓRIO', icon: '📎', color: '#4f46e5' }
  ],
  units: ['mg'],
  colors: [
    { name: 'Branco', hex: '#ffffff' }, { name: 'Preto', hex: '#111827' }, { name: 'Azul', hex: '#2563eb' },
    { name: 'Vermelho', hex: '#dc2626' }, { name: 'Amarelo', hex: '#facc15' }, { name: 'Verde', hex: '#16a34a' },
    { name: 'Rosa', hex: '#ec4899' }, { name: 'Cinza', hex: '#9ca3af' }, { name: 'Laranja', hex: '#f97316' },
    { name: 'Roxo', hex: '#9333ea' }
  ]
};
export const ICONS = ['💊', '🛒', '📎', '🏠', '🔧', '👕', '🍎', '🥩', '🧴', '📚', '🐾', '🎁', '🚗', '💻', '🌱', '📁'];
// Palavras que sugerem automaticamente um setor (chave = id do setor)
export const KEYWORDS = {
  farmacia: ['remedio', 'remédio', 'ibuprofeno', 'dipirona', 'comprimido'],
  mercado: ['arroz', 'feijão', 'feijao', 'leite', 'pão', 'pao'],
  escritorio: ['caneta', 'papel', 'grampeador', 'caderno']
};
// Tipo da quantidade a comprar (na lista)
export const BUY_UNITS = ['unidade(s)', 'caixa(s)', 'pacote(s)', 'frasco(s)', 'dúzia(s)', 'Kg', 'Lt.'];
