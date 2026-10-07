import { statusView } from './server-status-data.js';

const panel = document.querySelector('[data-server-status]');
if (panel) {
  const button = panel.querySelector('button');
  let data = null;
  let pending = false;
  function render() {
    const view = statusView(data);
    panel.dataset.state = view.state;
    panel.querySelector('[data-creation]').textContent = view.creation;
    panel.querySelector('[data-server-online]').textContent = view.server;
    panel.querySelector('[data-status-note]').textContent = view.message;
    const time = panel.querySelector('time');
    const timestamp = data?.observedAt;
    if (timestamp && Number.isFinite(Date.parse(timestamp))) {
      time.dateTime = timestamp;
      time.textContent = `Source updated ${new Date(timestamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}`;
      time.title = new Date(timestamp).toLocaleString();
    } else {
      time.removeAttribute('datetime');
      time.textContent = 'No current observation';
      time.removeAttribute('title');
    }
  }
  async function refresh() {
    if (pending) return;
    pending = true;
    button.disabled = true;
    button.textContent = 'Checking…';
    try {
      const response = await fetch('/api/server-status', {cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok && response.status!==503) throw new Error('Status unavailable');
      const next = await response.json();
      if (next.serverId!=='2106' || next.name!=='Azphel' || next.faction!=='Asmodian') throw new Error('Wrong server');
      data = next;
    } catch { data = null; }
    finally {
      render();
      pending = false;
      button.disabled = false;
      button.textContent = 'Refresh status';
    }
  }
  button.addEventListener('click',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
  setInterval(()=>{if(!document.hidden)refresh();},30000);
  setInterval(()=>{if(!document.hidden)render();},5000);
  refresh();
}
