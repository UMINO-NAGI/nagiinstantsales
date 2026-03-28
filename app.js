// app.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, query, where, getDocs, orderBy, deleteDoc } from 'firebase/firestore';

// Configuração Firebase (mesma do NAGI BROKER AI)
const firebaseConfig = {
    apiKey: "AIzaSyCsGNZ5JyzagqwEEYjkOu9Ch6U0QRf6stc",
    authDomain: "nagibrokerai-107b0.firebaseapp.com",
    projectId: "nagibrokerai-107b0",
    storageBucket: "nagibrokerai-107b0.firebasestorage.app",
    messagingSenderId: "45883710254",
    appId: "1:45883710254:web:1d6d8b330abf6cc07878bf",
    measurementId: "G-FRN86VXEPC"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

// Elementos DOM
let currentUser = null;
let currentCredits = 0;

// Funções auxiliares
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Calcular custo estimado com base no tamanho dos inputs
function calculateCost(product, description, audience) {
    const totalChars = (product + description + audience).length;
    let cost = 1 + Math.floor(totalChars / 500);
    return Math.min(5, Math.max(1, cost));
}

// Atualizar preview de custo no dashboard
function updateCostPreview() {
    const product = document.getElementById('product-name')?.value || '';
    const description = document.getElementById('product-description')?.value || '';
    const audience = document.getElementById('target-audience')?.value || '';
    const cost = calculateCost(product, description, audience);
    const costPreview = document.getElementById('cost-preview');
    if (costPreview) {
        costPreview.textContent = `Custo estimado: ${cost} crédito${cost > 1 ? 's' : ''}`;
    }
}

// ========== PÁGINA INDEX (Landing) ==========
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '') {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoDiv = document.getElementById('user-info');
    const userNameSpan = document.getElementById('user-name');

    loginBtn?.addEventListener('click', async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            // Após login, redirecionar para dashboard
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Erro login:', error);
            showNotification('Erro ao fazer login: ' + error.message, 'error');
        }
    });

    logoutBtn?.addEventListener('click', async () => {
        await signOut(auth);
        updateAuthUI(null);
    });

    function updateAuthUI(user) {
        if (user) {
            loginBtn.style.display = 'none';
            userInfoDiv.style.display = 'flex';
            userNameSpan.textContent = user.displayName || user.email;
        } else {
            loginBtn.style.display = 'inline-block';
            userInfoDiv.style.display = 'none';
        }
    }

    // Renderizar botões PayPal na landing
    function renderPayPalButtons() {
        if (!window.paypal) return;
        const plans = [
            { id: '19.99', amount: '19.99', credits: 20 },
            { id: '49.99', amount: '49.99', credits: 60 },
            { id: '199.00', amount: '199.00', credits: 300 }
        ];
        plans.forEach(plan => {
            const container = document.getElementById(`paypal-${plan.id}`);
            if (!container) return;
            container.innerHTML = '';
            paypal.Buttons({
                createOrder: (data, actions) => {
                    if (!currentUser) {
                        alert('Você precisa estar logado para comprar créditos.');
                        return Promise.reject();
                    }
                    return actions.order.create({
                        purchase_units: [{ amount: { value: plan.amount } }]
                    });
                },
                onApprove: async (data, actions) => {
                    container.innerHTML = '<p>Processando...</p>';
                    try {
                        const response = await fetch('/api/verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                orderID: data.orderID,
                                planID: plan.id,
                                userUID: currentUser.uid,
                                credits: plan.credits
                            })
                        });
                        const result = await response.json();
                        if (result.success) {
                            showNotification(`Pagamento confirmado! ${plan.credits} créditos adicionados.`, 'success');
                            // Atualizar créditos na interface se visível
                            if (document.getElementById('credits-amount')) {
                                await loadUserCredits(currentUser.uid);
                            }
                        } else {
                            showNotification('Falha na verificação: ' + (result.error || 'Erro desconhecido'), 'error');
                        }
                    } catch (error) {
                        showNotification('Erro ao verificar pagamento: ' + error.message, 'error');
                    } finally {
                        renderPayPalButtons();
                    }
                },
                onError: (err) => {
                    console.error(err);
                    showNotification('Erro no PayPal: ' + err.message, 'error');
                }
            }).render(container);
        });
    }

    // Observar autenticação
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateAuthUI(user);
        if (user) {
            // Garantir que o documento do usuário exista
            const userRef = doc(db, 'nagi_users', user.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    email: user.email,
                    name: user.displayName,
                    createdAt: new Date(),
                    credits: 0
                });
            }
            renderPayPalButtons();
        } else {
            const plans = ['19.99', '49.99', '199.00'];
            plans.forEach(pid => {
                const container = document.getElementById(`paypal-${pid}`);
                if (container) container.innerHTML = '<p style="color:gray;">Faça login para comprar</p>';
            });
        }
    });
}

// ========== PÁGINA DASHBOARD ==========
if (window.location.pathname.endsWith('dashboard.html')) {
    const logoutBtn = document.getElementById('logout-btn');
    const userNameSpan = document.getElementById('user-name');
    const creditsSpan = document.getElementById('credits-amount');
    const generateBtn = document.getElementById('generate-btn');
    const generatorForm = document.getElementById('generator-form');
    const outputBox = document.getElementById('generation-output');
    const generatedHtmlDiv = document.getElementById('generated-html');
    const copyBtn = document.getElementById('copy-html');
    const downloadBtn = document.getElementById('download-html');
    const showBuyCreditsBtn = document.getElementById('show-buy-credits');
    const modal = document.getElementById('buy-credits-modal');
    const closeModal = document.querySelector('.close');
    const productInput = document.getElementById('product-name');
    const descriptionInput = document.getElementById('product-description');
    const audienceInput = document.getElementById('target-audience');
    const pagesListDiv = document.getElementById('pages-list');

    // Função para carregar créditos do usuário
    async function loadUserCredits(userId) {
        const userRef = doc(db, 'nagi_users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            currentCredits = userSnap.data().credits || 0;
            creditsSpan.textContent = currentCredits;
            generateBtn.disabled = currentCredits <= 0;
            if (currentCredits <= 0) {
                generateBtn.title = 'Você não tem créditos suficientes. Compre mais.';
            } else {
                generateBtn.title = '';
            }
        }
    }

    // Carregar lista de páginas do usuário
    async function loadUserPages(userId) {
        const pagesRef = collection(db, 'nagi_pages');
        const q = query(pagesRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const pages = [];
        querySnapshot.forEach(doc => {
            pages.push({ id: doc.id, ...doc.data() });
        });
        if (pages.length === 0) {
            pagesListDiv.innerHTML = '<div class="empty-history"><i class="fas fa-file-alt"></i><p>Nenhuma página criada ainda</p></div>';
            return;
        }
        pagesListDiv.innerHTML = pages.map(page => `
            <div class="page-item" data-page-id="${page.id}">
                <div class="page-info">
                    <strong>${page.name.substring(0, 50)}</strong>
                    <small>${new Date(page.createdAt.toDate()).toLocaleDateString('pt-BR')}</small>
                </div>
                <div class="page-actions">
                    <button class="view-page" data-html="${escapeHtml(page.html)}"><i class="fas fa-eye"></i></button>
                    <button class="delete-page" data-id="${page.id}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
        // Adicionar event listeners
        document.querySelectorAll('.view-page').forEach(btn => {
            btn.addEventListener('click', () => {
                const html = btn.dataset.html;
                generatedHtmlDiv.innerHTML = html;
                outputBox.style.display = 'block';
                showNotification('Página carregada no preview', 'info');
            });
        });
        document.querySelectorAll('.delete-page').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pageId = btn.dataset.id;
                if (confirm('Tem certeza que deseja excluir esta página?')) {
                    await deleteDoc(doc(db, 'nagi_pages', pageId));
                    loadUserPages(currentUser.uid);
                    showNotification('Página excluída com sucesso!', 'success');
                }
            });
        });
    }

    // Helper para escapar HTML
    function escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // Atualizar preview de custo
    productInput.addEventListener('input', updateCostPreview);
    descriptionInput.addEventListener('input', updateCostPreview);
    audienceInput.addEventListener('input', updateCostPreview);
    updateCostPreview();

    // Gerar página
    generatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const product = productInput.value.trim();
        const description = descriptionInput.value.trim();
        const audience = audienceInput.value.trim();
        const style = document.getElementById('page-style').value;

        if (!product || !description || !audience) {
            showNotification('Preencha todos os campos!', 'error');
            return;
        }

        const cost = calculateCost(product, description, audience);
        if (currentCredits < cost) {
            showNotification(`Você precisa de ${cost} créditos. Seu saldo atual: ${currentCredits}`, 'error');
            return;
        }

        generateBtn.disabled = true;
        generateBtn.textContent = 'Gerando...';

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product,
                    description,
                    audience,
                    style,
                    userUID: currentUser.uid,
                    cost
                })
            });
            const data = await response.json();
            if (data.success) {
                // Salvar no Firestore (já salvo na função generate, mas podemos receber o HTML)
                generatedHtmlDiv.innerHTML = data.html;
                outputBox.style.display = 'block';
                // Recarregar créditos e lista de páginas
                await loadUserCredits(currentUser.uid);
                await loadUserPages(currentUser.uid);
                showNotification('Página gerada com sucesso!', 'success');
            } else {
                showNotification('Erro: ' + (data.error || 'Falha na geração'), 'error');
            }
        } catch (error) {
            console.error(error);
            showNotification('Erro na requisição: ' + error.message, 'error');
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Gerar página (1-5 créditos)';
        }
    });

    // Copiar HTML
    copyBtn.addEventListener('click', () => {
        const html = generatedHtmlDiv.innerHTML;
        navigator.clipboard.writeText(html).then(() => {
            showNotification('HTML copiado para a área de transferência!', 'success');
        }).catch(() => {
            showNotification('Erro ao copiar HTML', 'error');
        });
    });

    // Baixar HTML
    downloadBtn.addEventListener('click', () => {
        const html = generatedHtmlDiv.innerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `landing-page-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Arquivo baixado!', 'success');
    });

    // Modal de compra de créditos
    showBuyCreditsBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
    });
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Renderizar botões PayPal dentro do modal
    function renderModalPayPalButtons() {
        if (!window.paypal) return;
        const plans = [
            { id: '19.99', amount: '19.99', credits: 20 },
            { id: '49.99', amount: '49.99', credits: 60 },
            { id: '199.00', amount: '199.00', credits: 300 }
        ];
        plans.forEach(plan => {
            const container = document.getElementById(`modal-paypal-${plan.id}`);
            if (!container) return;
            container.innerHTML = '';
            paypal.Buttons({
                createOrder: (data, actions) => {
                    if (!currentUser) {
                        alert('Você precisa estar logado.');
                        return Promise.reject();
                    }
                    return actions.order.create({
                        purchase_units: [{ amount: { value: plan.amount } }]
                    });
                },
                onApprove: async (data, actions) => {
                    container.innerHTML = '<p>Processando...</p>';
                    try {
                        const response = await fetch('/api/verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                orderID: data.orderID,
                                planID: plan.id,
                                userUID: currentUser.uid,
                                credits: plan.credits
                            })
                        });
                        const result = await response.json();
                        if (result.success) {
                            showNotification(`Pagamento confirmado! ${plan.credits} créditos adicionados.`, 'success');
                            await loadUserCredits(currentUser.uid);
                            modal.style.display = 'none';
                        } else {
                            showNotification('Falha na verificação: ' + (result.error || 'Erro desconhecido'), 'error');
                        }
                    } catch (error) {
                        showNotification('Erro ao verificar pagamento: ' + error.message, 'error');
                    } finally {
                        renderModalPayPalButtons();
                    }
                },
                onError: (err) => {
                    showNotification('Erro no PayPal: ' + err.message, 'error');
                }
            }).render(container);
        });
    }

    // Logout
    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'index.html';
    });

    // Observar autenticação
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            userNameSpan.textContent = user.displayName || user.email;
            // Garantir que o documento do usuário existe
            const userRef = doc(db, 'nagi_users', user.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    email: user.email,
                    name: user.displayName,
                    createdAt: new Date(),
                    credits: 0
                });
            }
            await loadUserCredits(user.uid);
            await loadUserPages(user.uid);
            renderModalPayPalButtons();
        } else {
            window.location.href = 'index.html';
        }
    });
}