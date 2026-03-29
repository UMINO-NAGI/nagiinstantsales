// Firebase Config (do arquivo integrações nagisales.txt)
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

// Helper: chamadas para as Serverless Functions
async function callFunction(functionName, data) {
  const res = await fetch(`/api/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Erro na função ${functionName}`);
  }
  return res.json();
}

// Garantir documento do usuário
async function ensureUserDocument(uid, email, displayName) {
  await callFunction('ensureUser', { uid, email, displayName });
}

// Listener de créditos em tempo real
function subscribeToCredits(uid) {
  if (unsubscribeCredits) unsubscribeCredits();
  const userRef = db.collection('users').doc(uid);
  unsubscribeCredits = userRef.onSnapshot((docSnap) => {
    if (docSnap.exists) {
      const credits = docSnap.data().credits || 0;
      userCreditsSpan.innerText = `💰 ${credits} créditos`;
    } else {
      userCreditsSpan.innerText = `💰 0 créditos`;
    }
  });
}

// Carregar histórico
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
  }
}

// Inicializar PayPal (com client_id do backend)
async function initPayPal(creditsAmount, priceValue) {
  const clientIdResponse = await callFunction('getPaypalClientId', {});
  const clientId = clientIdResponse.clientId;
  if (!clientId) {
    generationStatus.innerText = 'Erro: PayPal não configurado.';
    return;
  }
  // Carregar SDK dinamicamente
  if (!document.querySelector('#paypal-script')) {
    const script = document.createElement('script');
    script.id = 'paypal-script';
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=BRL`;
    script.onload = () => renderPayPalButtons(creditsAmount, priceValue);
    document.body.appendChild(script);
  } else {
    renderPayPalButtons(creditsAmount, priceValue);
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
        alert('Erro ao capturar pagamento. Contate suporte.');
      }
    },
    onError: (err) => {
      console.error(err);
      alert('Erro no PayPal. Tente novamente.');
    }
  }).render('#paypal-buttons-container');
}

// Configurar pacotes de créditos
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

// Geração de página
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
      const { html, cost, remainingCredits } = result;
      previewIframe.srcdoc = html;
      generatedCodePre.innerText = html;
      generationStatus.innerText = `✅ Página gerada! Custo: ${cost} créditos. Saldo restante: ${remainingCredits}`;
      loadHistory(currentUser.uid);
      productDesc.value = '';
    } else {
      generationStatus.innerText = `❌ ${result.error}`;
      if (result.error.includes('créditos')) {
        alert('Créditos insuficientes. Adquira mais.');
      }
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

// Auth state
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await ensureUserDocument(user.uid, user.email, user.displayName);
    subscribeToCredits(user.uid);
    userNameSpan.innerText = user.displayName || user.email;
    userAvatarImg.src = user.photoURL || 'https://via.placeholder.com/48';
    landingView.style.display = 'none';
    dashboardView.style.display = 'block';
    loadHistory(user.uid);
    setupCreditPackages();
  } else {
    currentUser = null;
    if (unsubscribeCredits) unsubscribeCredits();
    landingView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
});

googleBtn.onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
};
logoutBtn.onclick = () => auth.signOut();