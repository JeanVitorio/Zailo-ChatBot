let currentStep = 1;
let carData = { files: [] };
let cars = { modelos: [] };
let carToDelete = null;

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelector(`.tab-button[onclick="showTab('${tabId}')"]`).classList.add('active');

    if (tabId === 'catalog') {
        loadCars();
    }
}

function updateStepContent() {
    document.querySelectorAll('.step-content').forEach(step => step.classList.add('hidden'));
    document.getElementById(`step${currentStep}`).classList.remove('hidden');
    document.getElementById('step-indicator').textContent = `Passo ${currentStep} de 2`;
    document.getElementById('prevBtn').classList.toggle('hidden', currentStep === 1);
    document.getElementById('nextBtn').textContent = currentStep === 1 ? 'Próximo' : 'Enviar';
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepContent();
    }
}

function nextStep() {
    if (currentStep < 2) {
        currentStep++;
        updateStepContent();
    } else {
        submitCar();
    }
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    carData.files = files;
    const preview = document.getElementById('image-preview');
    preview.innerHTML = '';
    files.forEach(file => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.className = 'w-24 h-24 object-cover rounded mr-2';
        preview.appendChild(img);
    });
}

function renderCars() {
    const carList = document.getElementById('car-list');
    carList.innerHTML = '';
    if (!cars.modelos || !Array.isArray(cars.modelos) || cars.modelos.length === 0) {
        carList.innerHTML = '<p style="color: #EF4444; text-align: center; font-weight: 500;">Nenhum veículo disponível.</p>';
        return;
    }
    cars.modelos.forEach((car, index) => {
        const carId = car.id || (index + 1).toString();
        const card = document.createElement('div');
        card.className = 'vehicle-card';
        const imageSrc = car.imagens && car.imagens.length > 0 ? `http://localhost:5000/${car.imagens[0]}` : 'https://via.placeholder.com/350x280?text=Sem+Imagem';
        card.innerHTML = `
            <div class="vehicle-card-image">
                <img src="${imageSrc}" alt="${car.nome || 'Veículo sem nome'}" onload="this.style.opacity='1'" onerror="this.onerror=null; this.src='https://via.placeholder.com/350x280?text=Sem+Imagem';">
            </div>
            <div class="vehicle-card-content">
                <h3>${car.nome || 'Sem nome'}</h3>
                <p>${car.preco || 'Preço não informado'}</p>
                <div class="card-buttons">
                    <a href="car-details.html?id=${carId}" class="details-button">Ver Detalhes</a>
                </div>
            </div>
            <button class="delete-btn" onclick="showDeleteDialog('${carId}')">🗑️</button>
        `;
        carList.appendChild(card);
    });
}

async function loadCars() {
    try {
        const response = await fetch('http://localhost:5000/api/cars');
        if (!response.ok) throw new Error(`Erro ao carregar carros: ${response.statusText}`);
        const data = await response.json();
        console.log('Dados recebidos:', data);
        cars = data;
        renderCars();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        document.getElementById('car-list').innerHTML = '<p style="color: #EF4444; text-align: center; font-weight: 500;">Erro ao carregar carros. Verifique o servidor.</p>';
    }
}

async function submitCar() {
    const formData = new FormData();
    formData.append('nome', carData.name || document.getElementById('car-name').value || '');
    formData.append('description', carData.description || document.getElementById('car-description').value || '');
    formData.append('preco', carData.price || document.getElementById('car-price').value || '');
    formData.append('mileage', carData.mileage || document.getElementById('car-mileage').value || '');
    carData.files.forEach(file => formData.append('imagens', file));

    try {
        const response = await fetch('http://localhost:5000/api/cars', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Erro ao cadastrar veículo');
        alert('Veículo cadastrado com sucesso!');
        carData = { files: [] };
        document.getElementById('car-form').reset();
        document.getElementById('image-preview').innerHTML = '';
        currentStep = 1;
        updateStepContent();
        showTab('catalog');
    } catch (error) {
        console.error('Erro ao cadastrar veículo:', error);
        alert(`Erro ao cadastrar veículo: ${error.message}`);
    }
}

function showDeleteDialog(carId) {
    carToDelete = carId;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteDialog() {
    document.getElementById('deleteModal').classList.add('hidden');
    carToDelete = null;
}

async function confirmDelete() {
    if (!carToDelete) return;
    try {
        const response = await fetch(`http://localhost:5000/api/cars/${carToDelete}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Erro ao excluir veículo');
        cars.modelos = cars.modelos.filter(car => (car.id || (cars.modelos.indexOf(car) + 1).toString()) !== carToDelete);
        renderCars();
        closeDeleteDialog();
        alert('Veículo excluído com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir veículo:', error);
        alert(`Erro ao excluir veículo: ${error.message}`);
    }
}

window.onload = () => {
    showTab('catalog');
};