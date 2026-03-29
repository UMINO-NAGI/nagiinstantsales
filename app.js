// ==================== CONFIGURAÇÕES ====================
const firebaseConfig = {
  apiKey: "AIzaSyBUHvHE3J3SVUD2W7ETu3QYQaQMkz3yQ7g",
  authDomain: "nagi-instant-sales.firebaseapp.com",
  projectId: "nagi-instant-sales",
  storageBucket: "nagi-instant-sales.firebasestorage.app",
  messagingSenderId: "285554508787",
  appId: "1:285554508787:web:1ad13e95d562482aab4886",
  measurementId: "G-N7SDVYWR8T"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Elementos DOM
const landing = document.getElementById('landing-view');
const dashboard = document.getElementById('dashboard-view');
const googleBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameSpan = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const userCreditsSpan = document.getElementById('user-credits');
const generateBtn = document.getElementById('generate-btn');
const productDesc = document.getElementById('product-description');
const genStatus = document.getElementById('generation-status');
const previewIframe = document.getElementById('preview-iframe');
const generatedCodePre = document.getElementById('generated-code');
const copyBtn = document.getElementById('copy-code-btn');
const historyDiv = document.getElementById('history-list');

let currentUser = null;
let unsubscribeCredits = null;

// Helper para mostrar mensagens temporárias
function showToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-5 right-5 z-50 px-4 py-2 rounded-lg shadow-lg text-white ${isError ? 'bg-red-600' : 'bg-green-600'} transition-opacity`;
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Chamada para serverless functions com tratamento detalhado
async function callFunction(fnName, data) {
  const res = await fetch(`/api/${fnName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
  }
  return res.json();
}

// Garantir documento do usuário
async function ensureUserDocument(uid, email, displayName) {
  try {
    await callFunction('ensureUser', { uid, email, displayName });
  } catch (err) {
    console.warn('ensureUser falhou, mas continuamos:', err.message);
  }
}

// Listener de créditos em tempo real
function subscribeToCredits(uid) {
  if (unsubscribeCredits) unsubscribeCredits();
  const userRef = db.collection('users').doc(uid);
  unsubscribeCredits = userRef.onSnapshot((doc) => {
    if (doc.exists) userCreditsSpan.innerText = doc.data().credits || 0;
    else userCreditsSpan.innerText = '0';
  }, (err) => console.error('Erro no snapshot:', err));
}

// Carregar histórico
async function loadHistory(uid) {
  try {
    const { history } = await callFunction('getHistory', { uid });
    historyDiv.innerHTML = '';
    if (!history.length) {
      historyDiv.innerHTML = '<p class="text-gray-400">Nenhuma página gerada ainda.</p>';
      return;
    }
    history.slice().reverse().forEach(item => {
      const div = document.createElement('div');
      div.className = 'bg-gray-800 p-3 rounded-xl cursor-pointer hover:bg-gray-700 transition';
      div.innerHTML = `
        <div class="flex justify-between text-sm">
          <span><i class="far fa-calendar-alt"></i> ${new Date(item.timestamp).toLocaleString()}</span>
          <span class="text-yellow-400">⚡ ${item.cost} créditos</span>
        </div>
        <p class="truncate mt-1">${item.prompt.substring(0, 100)}</p>
      `;
      div.onclick = () => {
        previewIframe.srcdoc = item.generatedHTML;
        generatedCodePre.innerText = item.generatedHTML;
        document.querySelector('[data-tab="preview"]').click();
      };
      historyDiv.appendChild(div);
    });
  } catch (err) {
    historyDiv.innerHTML = '<p class="text-red-400">Erro ao carregar histórico.</p>';
  }
}

// PayPal – carregar SDK e renderizar botões
async function initPayPal(credits, amount) {
  try {
    const { clientId } = await callFunction('getPaypalClientId', {});
    if (!clientId) throw new Error('Client ID não recebido');
    if (!window.paypal) {
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=BRL`;
      script.onload = () => renderPayPalButtons(credits, amount);
      document.body.appendChild(script);
    } else {
      renderPayPalButtons(credits, amount);
    }
  } catch (err) {
    showToast('Erro ao carregar PayPal: ' + err.message, true);
  }
}

function renderPayPalButtons(credits, amount) {
  const container = document.getElementById('paypal-buttons-container');
  container.innerHTML = '';
  window.paypal.Buttons({
    createOrder: async () => {
      const { orderID } = await callFunction('paypal-create-order', { amount });
      return orderID;
    },
    onApprove: async (data) => {
      const result = await callFunction('paypal-capture-order', { orderID: data.orderID, userId: currentUser.uid, creditsToAdd: credits });
      if (result.success) showToast(`✅ ${credits} créditos adicionados!`);
      else showToast('Erro na captura do pagamento', true);
    },
    onError: (err) => {
      console.error(err);
      showToast('Erro no PayPal. Tente novamente.', true);
    }
  }).render('#paypal-buttons-container');
}

function setupCreditPackages() {
  const packages = [
    { credits: 20, amount: '19.99' },
    { credits: 60, amount: '49.99' },
    { credits: 250, amount: '199.00' }
  ];
  const container = document.getElementById('paypal-buttons-container');
  container.innerHTML = '';
  packages.forEach(pkg => {
    const btn = document.createElement('button');
    btn.className = 'bg-blue-600 hover:bg-blue-700 w-full py-2 rounded-lg mb-2 font-semibold';
    btn.innerText = `Comprar ${pkg.credits} créditos - R$ ${pkg.amount}`;
    btn.onclick = () => initPayPal(pkg.credits, pkg.amount);
    container.appendChild(btn);
  });
}

// Geração de página
generateBtn.onclick = async () => {
  if (!currentUser) return;
  const prompt = productDesc.value.trim();
  if (!prompt) return showToast('Descreva o produto primeiro.', true);
  genStatus.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Gerando página...';
  generateBtn.disabled = true;
  try {
    const result = await callFunction('generate', { prompt, userId: currentUser.uid });
    if (result.success) {
      previewIframe.srcdoc = result.html;
      generatedCodePre.innerText = result.html;
      genStatus.innerHTML = `✅ Página gerada! Custo: ${result.cost} créditos. Saldo: ${result.remainingCredits}`;
      loadHistory(currentUser.uid);
      productDesc.value = '';
      showToast(`Página criada! Custo: ${result.cost} créditos`);
    } else {
      genStatus.innerHTML = `❌ ${result.error}`;
      if (result.error.includes('créditos')) showToast('Créditos insuficientes!', true);
    }
  } catch (err) {
    genStatus.innerHTML = `❌ Erro: ${err.message}`;
    showToast('Falha na geração. Veja console.', true);
  } finally {
    generateBtn.disabled = false;
  }
};

// Copiar código
copyBtn.onclick = () => {
  const code = generatedCodePre.innerText;
  if (code) navigator.clipboard.writeText(code).then(() => showToast('Código copiado!'));
};

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('bg-blue-600', 'text-white'));
    btn.classList.add('bg-blue-600', 'text-white');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    document.getElementById(`${tab}-container`).classList.remove('hidden');
  });
});

// Auth
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await ensureUserDocument(user.uid, user.email, user.displayName);
    subscribeToCredits(user.uid);
    userNameSpan.innerText = user.displayName || user.email;
    userAvatar.src = user.photoURL || 'https://ui-avatars.com/api/?background=3b82f6&color=fff&name=' + encodeURIComponent(user.displayName || 'User');
    landing.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadHistory(user.uid);
    setupCreditPackages();
  } else {
    currentUser = null;
    if (unsubscribeCredits) unsubscribeCredits();
    landing.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }
});

googleBtn.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
logoutBtn.onclick = () => auth.signOut();