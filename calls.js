// Opening a tel: URI cannot prove that the phone connected or suppress OS prompts.
export const browserDialer = { open: uri => window.location.assign(uri) };
export const CALL_STATES = {
  requested: 'Автоматически запрошено открытие звонка. Факт вызова не подтверждён. Если телефон спросит — подтвердите; если ничего не открылось — нажмите кнопку звонка.',
  blocked: 'Браузер не позволил автоматически открыть звонок. Нажмите кнопку звонка ниже.',
  deferred: 'Звонок ожидает возвращения к открытому приложению. Фоновый вызов браузер не гарантирует.',
  expired: 'Тревога восстановлена с задержкой. Автоматический звонок пропущен; используйте кнопку звонка.',
  changed: 'Номер звонка изменился после начала тревоги. Автоматический запуск пропущен; проверьте номер на кнопке.',
  invalid: 'Номер для автоматического звонка недоступен. Используйте другие способы связи.',
  storage: 'Не удалось сохранить отметку автозапуска. Чтобы не создавать повторные вызовы, используйте кнопку звонка.',
};

export class CallCoordinator {
  constructor({ open = uri => browserDialer.open(uri), onUpdate = () => {}, now = () => Date.now(), visible = () => !document.hidden } = {}) {
    this.open = open; this.onUpdate = onUpdate; this.now = now; this.visible = visible; this.attempted = new Set();
  }
  request(event, target) {
    if (event.status !== 'active' || event.test || target.autoCall !== true) return false;
    if (event.callRequestedAt || this.attempted.has(event.id)) return false;
    const update = (callState, extra = {}) => this.onUpdate(event.id, { callState, ...extra });
    const number = event.callTarget || target.number;
    if (!/^(?:\+[1-9]\d{7,14}|112)$/.test(number)) { update('invalid'); return false; }
    if (number !== target.number) { update('changed'); return false; }
    if (!Number.isFinite(event.createdAt) || this.now() - event.createdAt > 300000 || event.createdAt - this.now() > 5000) { update('expired'); return false; }
    if (!this.visible()) { update('deferred'); return false; }
    this.attempted.add(event.id);
    // Сначала фиксируем попытку, затем открываем телефон: reload не дублирует вызов.
    if (update('requested', { callRequestedAt: this.now(), callTarget: number }) === false) { update('storage'); return false; }
    try { this.open(`tel:${number}`); }
    catch { update('blocked'); }
    return true;
  }
}
