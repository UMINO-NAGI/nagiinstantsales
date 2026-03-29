// Firebase Config (do arquivo)
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
const landingView = document.getElementById('landing-view');
const dashboardView = document.getElementById('dashboard-view');
const googleBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameSpan = document.getElementById('user-name');
const userAvatarImg = document.getElementById('user-avatar');
const userCreditsSpan = document.getElementById('user-credits');
const generateBtn = document.getElementById('generate-btn');
const productDesc = document.getElementById('product-description');
const generationStatus = document.getElementById('generation-status');
const previewIframe = document.getElementById('preview-iframe');
const generatedCodePre = document.getElementById('generated-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const historyListDiv = document.getElementById('history-list');

let currentUser = null;
let unsubscribeCredits = null;

// Helper com logs
async function callFunction(functionName, data) {
  console.log(`Chamando /api/${functionName}`, data);
  try {
    const res = await fetch(`/api/${functionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    const json = await res.json();
    console.log(`Resposta de ${functionName}:`, json);
    return json;
  } catch (err) {
    console.error(`Erro em ${functionName}:`, err);
    throw err;
  }
}

// Garantir documento do usuário (mas não impede o dashboard)
async function ensureUserDocument(uid, email, displayName) {
  try {
    await callFunction('ensureUser', { uid, email, displayName });
  } catch (err) {
    console.warn('ensureUser falhou, mas vamos continuar:', err.message);
    // Se falhar, o documento pode já existir ou será criado na primeira geração/compr
  }
}

function showDashboard() {
  landingView.style.display = 'none';
  dashboardView.style.display = 'block';
}

function showLanding() {
  landingView.style.display = 'block';
  dashboardView.style.display = 'none';
}

// Listener de créditos
function subscribeToCredits(uid) {
  if (unsubscribeCredits) unsubscribeCredits();
  const userRef = db.collection('users').doc(uid);
  unsubscribeCredits = userRef.onSnapshot((docSnap) => {
    if (docSnap.exists) {
      const credits = docSnap.data().credits || 0;
      userCreditsSpan.innerText = `💰 ${credits} créditos`;
    } else {
      userCreditsSpan.innerText = `💰 0 créditos`;
      console.warn('Documento do usuário não encontrado no Firestore');
    }
  }, (error) => {
    console.error('Erro no snapshot de créditos:', error);
  });
}

async function loadHistory(uid) {
  try {
    const result = await callFunction('getHistory', { uid });
    const history = result.history || [];
    historyListDiv.innerHTML = '';
    if (history.length === 0) {
      historyListDiv.innerHTML = '<p>Nenhuma página gerada ainda.</p>';
      return;
    }
    history.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <strong>${new Date(item.timestamp).toLocaleString()}</strong><br>
        <small>🎯 ${item.prompt.substring(0, 80)}...</small><br>
        <span style="color:#facc15">⚡ custo: ${item.cost} créditos</span>
      `;
      div.addEventListener('click', () => {
        previewIframe.srcdoc = item.generatedHTML;
        generatedCodePre.innerText = item.generatedHTML;
        document.querySelector('.tab-btn[data-tab="preview"]').click();
      });
      historyListDiv.appendChild(div);
    });
  } catch (err) {
    console.error('Erro ao carregar histórico', err);
    historyListDiv.innerHTML = '<p>Erro ao carregar histórico. Tente recarregar.</p>';
  }
}

// Inicializar PayPal (igual antes)
async function initPayPal(creditsAmount, priceValue) {
  try {
    const clientIdResponse = await callFunction('getPaypalClientId', {});
    const clientId = clientIdResponse.clientId;
    if (!clientId) throw new Error('Client ID não retornado');
    if (!document.querySelector('#paypal-script')) {
      const script = document.createElement('script');
      script.id = 'paypal-script';
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=BRL`;
      script.onload = () => renderPayPalButtons(creditsAmount, priceValue);
      document.body.appendChild(script);
    } else {
      renderPayPalButtons(creditsAmount, priceValue);
    }
  } catch (err) {
    generationStatus.innerText = 'Erro ao carregar PayPal: ' + err.message;
  }
}

function renderPayPalButtons(creditsAmount, priceValue) {
  const container = document.getElementById('paypal-buttons-container');
  container.innerHTML = '';
  window.paypal.Buttons({
    createOrder: async () => {
      const response = await callFunction('paypal-create-order', { amount: priceValue });
      return response.orderID;
    },
    onApprove: async (data) => {
      const captureResult = await callFunction('paypal-capture-order', {
        orderID: data.orderID,
        userId: currentUser.uid,
        creditsToAdd: creditsAmount
      });
      if (captureResult.success) {
        alert(`✅ Compra concluída! ${creditsAmount} créditos adicionados.`);
      } else {
        alert('Erro ao capturar pagamento.');
      }
    },
    onError: (err) => {
      console.error(err);
      alert('Erro no PayPal. Tente novamente.');
    }
  }).render('#paypal-buttons-container');
}

function setupCreditPackages() {
  const packages = [
    { price: '19.99', credits: 20 },
    { price: '49.99', credits: 60 },
    { price: '199.00', credits: 250 }
  ];
  const container = document.getElementById('paypal-buttons-container');
  container.innerHTML = '';
  packages.forEach(pkg => {
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.style.margin = '0.5rem';
    btn.innerText = `Comprar ${pkg.credits} créditos - R$ ${pkg.price}`;
    btn.onclick = () => initPayPal(pkg.credits, pkg.price);
    container.appendChild(btn);
  });
}

// Geração (igual antes)
generateBtn.onclick = async () => {
  if (!currentUser) return;
  const prompt = productDesc.value.trim();
  if (!prompt) {
    generationStatus.innerText = 'Descreva o produto primeiro.';
    return;
  }
  generationStatus.innerText = '🔄 Verificando créditos e gerando página...';
  generateBtn.disabled = true;
  try {
    const result = await callFunction('generate', { prompt, userId: currentUser.uid });
    if (result.success) {
      previewIframe.srcdoc = result.html;
      generatedCodePre.innerText = result.html;
      generationStatus.innerText = `✅ Página gerada! Custo: ${result.cost} créditos. Saldo restante: ${result.remainingCredits}`;
      loadHistory(currentUser.uid);
      productDesc.value = '';
    } else {
      generationStatus.innerText = `❌ ${result.error}`;
      if (result.error.includes('créditos')) alert('Créditos insuficientes. Adquira mais.');
    }
  } catch (err) {
    generationStatus.innerText = `Erro: ${err.message}`;
  } finally {
    generateBtn.disabled = false;
  }
};

copyCodeBtn.onclick = () => {
  const code = generatedCodePre.innerText;
  navigator.clipboard.writeText(code);
  alert('Código copiado!');
};

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.getElementById(`${tab}-container`).classList.add('active');
  });
});

// Auth state - parte mais crítica
auth.onAuthStateChanged(async (user) => {
  console.log('Auth state changed:', user ? `Logado como ${user.email}` : 'Deslogado');
  if (user) {
    currentUser = user;
    // Tenta criar/garantir documento (não bloqueia)
    await ensureUserDocument(user.uid, user.email, user.displayName);
    // Inscreve para ouvir créditos
    subscribeToCredits(user.uid);
    // Preenche dados do usuário
    userNameSpan.innerText = user.displayName || user.email;
    userAvatarImg.src = user.photoURL || 'https://via.placeholder.com/48';
    // Mostra dashboard
    showDashboard();
    // Carrega histórico
    loadHistory(user.uid);
    // Configura botões de compra
    setupCreditPackages();
  } else {
    currentUser = null;
    if (unsubscribeCredits) unsubscribeCredits();
    showLanding();
  }
});

googleBtn.onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => console.error('Erro login:', err));
};
logoutBtn.onclick = () => auth.signOut();