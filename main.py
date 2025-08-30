from flask import Flask, request, jsonify, send_from_directory, send_file
import os
import json
import uuid
import shutil
from datetime import datetime

app = Flask(__name__)

# Middleware CORS
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    return response

# Explicit OPTIONS route for CORS preflight
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    response = jsonify({"status": "ok"})
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    return response

# Configuração de diretórios
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAR_DIR = os.path.join(BASE_DIR, 'cars')
DOC_DIR = os.path.join(BASE_DIR, 'documents')
CARROS_JSON = os.path.join(BASE_DIR, 'carros.json')
CLIENTES_JSON = os.path.join(BASE_DIR, 'clients.json')
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
QRCODE_DIR = os.path.join(BASE_DIR, 'QRCODE')

# Criar diretórios se não existirem
for directory in [CAR_DIR, DOC_DIR, TEMPLATES_DIR, QRCODE_DIR]:
    os.makedirs(directory, exist_ok=True)

# Funções para carregar e salvar JSON
def load_carros():
    if os.path.exists(CARROS_JSON):
        try:
            with open(CARROS_JSON, 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Carros carregados com sucesso: {len(data.get('modelos', []))} modelos")
                return data
        except Exception as e:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao carregar carros.json: {e}")
            return {"modelos": [], "numeros_para_contato": []}
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] carros.json não encontrado, retornando dados vazios")
    return {"modelos": [], "numeros_para_contato": []}

def save_carros(data):
    try:
        with open(CARROS_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] carros.json salvo com sucesso")
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao salvar carros.json: {e}")
        raise

def load_clientes():
    if os.path.exists(CLIENTES_JSON):
        try:
            with open(CLIENTES_JSON, 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Clientes carregados com sucesso: {len(data.get('clients', []))} clientes")
                return data
        except Exception as e:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao carregar clientes.json: {e}")
            return {"clients": []}
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] clientes.json não encontrado, retornando dados vazios")
    return {"clients": []}

def save_clientes(data):
    try:
        with open(CLIENTES_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] clientes.json salvo com sucesso")
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao salvar clientes.json: {e}")
        raise

# Carregar dados na inicialização
carros_data = load_carros()
clientes_data = load_clientes()

# Rotas da API
@app.route('/', methods=['GET'])
def serve_index():
    try:
        return send_file(os.path.join(TEMPLATES_DIR, 'index.html'))
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao servir index.html: {str(e)}")
        return jsonify({"error": "Erro ao carregar página inicial"}), 500

@app.route('/api/cars', methods=['GET'])
def get_cars():
    try:
        return jsonify(carros_data), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao obter carros: {str(e)}")
        return jsonify({"error": f"Erro ao carregar dados de carros: {str(e)}"}), 500

@app.route('/api/cars', methods=['POST'])
def add_car():
    try:
        car_data = request.form.to_dict()
        name = car_data.get('name')
        if not name:
            return jsonify({"error": "Nome do carro é obrigatório"}), 400
        
        car_id = str(uuid.uuid4())
        car_dir = os.path.join(CAR_DIR, car_id)
        os.makedirs(car_dir, exist_ok=True)
        
        new_car = {
            "id": car_id,
            "nome": name,
            "ano": car_data.get('year', ''),
            "preco": car_data.get('price', 'R$ 0'),
            "descricao": car_data.get('description', ''),
            "imagens": []
        }
        
        if 'images' in request.files:
            files = request.files.getlist('images')
            for i, file in enumerate(files, 1):
                if file and file.filename:
                    ext = file.filename.split('.')[-1].lower()
                    if ext in ['png', 'jpg', 'jpeg', 'gif']:
                        filename = f"image_{i}_{uuid.uuid4().hex}.{ext}"
                        filepath = os.path.join(car_dir, filename)
                        try:
                            file.save(filepath)
                            new_car['imagens'].append(f"cars/{car_id}/{filename}")
                        except Exception as e:
                            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao salvar imagem {filename}: {e}")
                            continue
        
        carros_data['modelos'].append(new_car)
        save_carros(carros_data)
        
        return jsonify(new_car), 201
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao adicionar carro: {str(e)}")
        return jsonify({"error": f"Erro ao adicionar carro: {str(e)}"}), 500

@app.route('/api/cars/<car_id>', methods=['PUT'])
def update_car(car_id):
    try:
        car_data = request.form.to_dict()
        car = next((c for c in carros_data['modelos'] if c['id'] == car_id), None)
        if not car:
            return jsonify({"error": "Carro não encontrado"}), 404
        
        car['nome'] = car_data.get('name', car['nome'])
        car['ano'] = car_data.get('year', car['ano'])
        car['preco'] = car_data.get('price', car['preco'])
        car['descricao'] = car_data.get('description', car['descricao'])
        
        car_dir = os.path.join(CAR_DIR, car_id)
        os.makedirs(car_dir, exist_ok=True)
        
        if 'images' in request.files:
            files = request.files.getlist('images')
            if files:
                start_index = len(car['imagens']) + 1
                for i, file in enumerate(files, start_index):
                    if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                        filename = f"image_{i}_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                        filepath = os.path.join(car_dir, filename)
                        file.save(filepath)
                        car['imagens'].append(f"cars/{car_id}/{filename}")
        
        save_carros(carros_data)
        
        return jsonify(car), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao atualizar carro {car_id}: {str(e)}")
        return jsonify({"error": f"Erro ao atualizar carro: {str(e)}"}), 500

@app.route('/api/cars/<car_id>', methods=['DELETE'])
def delete_car(car_id):
    try:
        car_to_delete = next((c for c in carros_data['modelos'] if c.get('id') == car_id), None)
        if not car_to_delete:
            return jsonify({"error": "Carro não encontrado"}), 404
        
        carros_data['modelos'] = [c for c in carros_data['modelos'] if c.get('id') != car_id]
        car_dir = os.path.join(CAR_DIR, car_id)
        if os.path.exists(car_dir):
            shutil.rmtree(car_dir)
        save_carros(carros_data)
        
        return jsonify({"message": "Carro removido com sucesso"}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao deletar carro {car_id}: {str(e)}")
        return jsonify({"error": f"Erro ao deletar carro: {str(e)}"}), 500

@app.route('/api/cars/<car_id>/images/<int:image_index>', methods=['DELETE'])
def delete_car_image(car_id, image_index):
    try:
        car = next((c for c in carros_data['modelos'] if c.get('id') == car_id), None)
        if not car:
            return jsonify({"error": "Carro não encontrado"}), 404
        
        if not car.get('imagens') or image_index < 0 or image_index >= len(car['imagens']):
            return jsonify({"error": "Índice de imagem inválido"}), 400
        
        image_path = car['imagens'].pop(image_index)
        full_path = os.path.join(BASE_DIR, image_path)
        if os.path.exists(full_path):
            os.remove(full_path)
        save_carros(carros_data)
        
        return jsonify({"message": "Imagem removida com sucesso", "imagens_restantes": car['imagens']}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao deletar imagem do carro {car_id}: {str(e)}")
        return jsonify({"error": f"Erro ao deletar imagem: {str(e)}"}), 500

@app.route('/api/clients', methods=['GET'])
def get_clients():
    try:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Retornando clientes: {len(clientes_data.get('clients', []))} clientes")
        return jsonify(clientes_data), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao obter clientes: {str(e)}")
        return jsonify({"error": f"Erro ao carregar dados de clientes: {str(e)}"}), 500

@app.route('/api/clients', methods=['POST'])
def add_client():
    try:
        client_data = request.get_json(silent=True) or request.form.to_dict()
        chat_id = client_data.get('chat_id', str(uuid.uuid4()))
        name = client_data.get('name')
        if not name:
            return jsonify({"error": "Nome do cliente é obrigatório"}), 400
        
        interests = client_data.get('interests', {})
        if isinstance(interests, str):
            try:
                interests = json.loads(interests)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear interests: {str(e)}"}), 400
        
        documents = client_data.get('documents', [])
        if isinstance(documents, str):
            try:
                documents = json.loads(documents)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear documents: {str(e)}"}), 400
        
        visit_details = client_data.get('visit_details', {})
        if isinstance(visit_details, str):
            try:
                visit_details = json.loads(visit_details)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear visit_details: {str(e)}"}), 400
        
        bot_data = client_data.get('bot_data', {})
        if isinstance(bot_data, str):
            try:
                bot_data = json.loads(bot_data)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear bot_data: {str(e)}"}), 400
        
        phone = client_data.get('phone', interests.get('phone', ''))
        cpf = client_data.get('cpf', interests.get('documents', {}).get('cpf', ''))
        job = client_data.get('job', interests.get('job', ''))
        payment_method = client_data.get('payment_method', None)
        rg_number = client_data.get('rg_number', '')
        incomeProof = client_data.get('incomeProof', '')
        rg_photo = client_data.get('rg_photo', '')
        
        # --- CORREÇÃO APLICADA AQUI ---
        # Captura o tipo de negociação do payload
        deal_type = client_data.get('deal_type')
        # Garante que ele também seja salvo dentro de bot_data para consistência
        if deal_type:
            bot_data['deal_type'] = deal_type
        # --- FIM DA CORREÇÃO ---

        # Lidar com upload de arquivos
        client_dir = os.path.join(DOC_DIR, chat_id)
        os.makedirs(client_dir, exist_ok=True)
        if 'incomeProof' in request.files:
            files = request.files.getlist('incomeProof')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"income_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
                    incomeProof = f"documents/{chat_id}/{filename}"
        
        if 'rg_photo' in request.files:
            files = request.files.getlist('rg_photo')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"rg_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
                    rg_photo = f"documents/{chat_id}/{filename}"
        
        # Criar novo cliente
        new_client = {
            'chat_id': chat_id,
            'name': name,
            'phone': phone,
            'cpf': cpf,
            'job': job,
            'state': client_data.get('state', 'inicial'),
            'documents': documents,
            'report': client_data.get('report', 'Cliente adicionado manualmente'),
            'payment_method': payment_method,
            'deal_type': deal_type,
            'rg_number': rg_number,
            'incomeProof': incomeProof,
            'rg_photo': rg_photo,
            'visit_details': visit_details,
            'bot_data': bot_data
        }
        
        clientes_data['clients'].append(new_client)
        save_clientes(clientes_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Cliente adicionado: {chat_id}")
        return jsonify(new_client), 201
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao adicionar cliente: {str(e)}")
        return jsonify({"error": f"Erro ao adicionar cliente: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>', methods=['GET'])
def get_client(chat_id):
    try:
        client = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        return jsonify(client), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao obter cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao obter cliente: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>', methods=['PUT'])
def update_client(chat_id):
    try:
        client_data = request.get_json(silent=True) or request.form.to_dict()
        client = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        
        interests = client_data.get('interests', client.get('interests', {}))
        if isinstance(interests, str):
            try:
                interests = json.loads(interests)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear interests: {str(e)}"}), 400
        
        visit_details = client_data.get('visit_details', client.get('visit_details', {}))
        if isinstance(visit_details, str):
            try:
                visit_details = json.loads(visit_details)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear visit_details: {str(e)}"}), 400
        
        bot_data = client_data.get('bot_data', client.get('bot_data', {}))
        if isinstance(bot_data, str):
            try:
                bot_data = json.loads(bot_data)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear bot_data: {str(e)}"}), 400
        
        documents = client.get('documents', [])
        if 'documents' in client_data:
            new_documents = client_data['documents']
            if isinstance(new_documents, str):
                try:
                    new_documents = json.loads(new_documents)
                except json.JSONDecodeError as e:
                    return jsonify({"error": f"Erro ao parsear documents: {str(e)}"}), 400
            documents = new_documents
        
        name = client_data.get('name', client.get('name', ''))
        phone = client_data.get('phone', interests.get('phone', client.get('phone', '')))
        cpf = client_data.get('cpf', interests.get('documents', {}).get('cpf', client.get('cpf', '')))
        job = client_data.get('job', interests.get('job', client.get('job', '')))
        state = client_data.get('state', client.get('state', 'inicial'))
        payment_method = client_data.get('payment_method', client.get('payment_method', None))
        rg_number = client_data.get('rg_number', client.get('rg_number', ''))
        incomeProof = client_data.get('incomeProof', client.get('incomeProof', ''))
        rg_photo = client_data.get('rg_photo', client.get('rg_photo', ''))
        
        # Lidar com upload de arquivos
        client_dir = os.path.join(DOC_DIR, chat_id)
        os.makedirs(client_dir, exist_ok=True)
        if 'incomeProof' in request.files:
            files = request.files.getlist('incomeProof')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"income_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
                    incomeProof = f"documents/{chat_id}/{filename}"
        
        if 'rg_photo' in request.files:
            files = request.files.getlist('rg_photo')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"rg_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
                    rg_photo = f"documents/{chat_id}/{filename}"
        
        # Atualizar cliente no clients.json
        client.update({
            'name': name,
            'phone': phone,
            'cpf': cpf,
            'job': job,
            'state': state,
            'report': client_data.get('report', client.get('report', '')),
            'documents': documents,
            'payment_method': payment_method,
            'rg_number': rg_number,
            'incomeProof': incomeProof,
            'rg_photo': rg_photo,
            'visit_details': visit_details,
            'bot_data': bot_data
        })
        save_clientes(clientes_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Cliente atualizado: {chat_id}")
        return jsonify(client), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao atualizar cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao atualizar cliente: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>', methods=['DELETE'])
def delete_client(chat_id):
    try:
        client = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        
        clientes_data['clients'] = [c for c in clientes_data['clients'] if c['chat_id'] != chat_id]
        client_dir = os.path.join(DOC_DIR, chat_id)
        if os.path.exists(client_dir):
            shutil.rmtree(client_dir)
        save_clientes(clientes_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Cliente deletado: {chat_id}")
        return jsonify({"message": "Cliente removido com sucesso"}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao deletar cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao deletar cliente: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>/files', methods=['POST'])
def upload_client_files(chat_id):
    try:
        client = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        
        client_dir = os.path.join(DOC_DIR, chat_id)
        os.makedirs(client_dir, exist_ok=True)
        
        # Garante que as listas e objetos existam
        if 'documents' not in client or not isinstance(client.get('documents'), list):
            client['documents'] = []
        if 'bot_data' not in client:
            client['bot_data'] = {}
        if 'trade_in_car' not in client['bot_data']:
            client['bot_data']['trade_in_car'] = {}
        if 'photos' not in client['bot_data']['trade_in_car'] or not isinstance(client['bot_data']['trade_in_car'].get('photos'), list):
            client['bot_data']['trade_in_car']['photos'] = []

        # Processa documentos genéricos do cliente
        if 'documents' in request.files:
            files = request.files.getlist('documents')
            for file in files:
                if file and file.filename:
                    filename = f"doc_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    client['documents'].append(f"documents/{chat_id}/{filename}")

        # Processa fotos do veículo de troca
        if 'trade_in_photos' in request.files:
            files = request.files.getlist('trade_in_photos')
            for file in files:
                if file and file.filename:
                    filename = f"trade_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    client['bot_data']['trade_in_car']['photos'].append(f"documents/{chat_id}/{filename}")
        
        save_clientes(clientes_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Arquivos enviados para o cliente: {chat_id}")
        return jsonify({"message": "Arquivos enviados com sucesso", "client": client}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao enviar arquivos para o cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao enviar arquivos: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>/documents', methods=['POST'])
def upload_client_documents(chat_id):
    try:
        client = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        
        client_dir = os.path.join(DOC_DIR, chat_id)
        os.makedirs(client_dir, exist_ok=True)
        documents = client.get('documents', [])
        
        if 'documents' in request.files:
            files = request.files.getlist('documents')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"doc_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
        
        client['documents'] = documents
        save_clientes(clientes_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Documentos adicionados para cliente: {chat_id}")
        return jsonify({"message": "Documentos adicionados com sucesso", "documents": documents}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao adicionar documentos para cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao adicionar documentos: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>/documents', methods=['DELETE'])
def delete_client_documents(chat_id):
    try:
        client = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        
        data = request.get_json()
        doc_paths = data.get('docPaths', [])
        if not isinstance(doc_paths, list):
            return jsonify({"error": "docPaths deve ser uma lista"}), 400
        
        documents = client.get('documents', [])
        for path in doc_paths:
            if path in documents:
                documents.remove(path)
            full_path = os.path.join(BASE_DIR, path)
            if os.path.exists(full_path):
                os.remove(full_path)
            if path == client.get('incomeProof'):
                client['incomeProof'] = ''
            if path == client.get('rg_photo'):
                client['rg_photo'] = ''
        
        client['documents'] = documents
        save_clientes(clientes_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Documentos deletados para cliente: {chat_id}")
        return jsonify({"message": "Documentos removidos com sucesso"}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao deletar documentos para cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao deletar documentos: {str(e)}"}), 500

@app.route('/cars/<path:path>')
def serve_car_images(path):
    try:
        return send_from_directory(CAR_DIR, path)
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao servir imagem do carro {path}: {str(e)}")
        return jsonify({"error": "Imagem não encontrada"}), 404

@app.route('/documents/<path:path>')
def serve_client_documents(path):
    try:
        return send_from_directory(DOC_DIR, path)
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao servir documento do cliente {path}: {str(e)}")
        return jsonify({"error": "Documento não encontrado"}), 404

@app.route('/QRCODE/<path:path>')
def serve_qrcode(path):
    try:
        return send_from_directory(QRCODE_DIR, path)
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao servir QR code {path}: {str(e)}")
        return jsonify({"error": "QR code não encontrado"}), 404

@app.route('/api/clients/<chat_id>/trade_in_photos', methods=['POST'])
def upload_trade_in_photos(chat_id):
    try:
        client = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404

        if 'bot_data' not in client:
            client['bot_data'] = {}
        if 'trade_in_car' not in client['bot_data']:
            client['bot_data']['trade_in_car'] = {}
        if 'photos' not in client['bot_data']['trade_in_car'] or not isinstance(client['bot_data']['trade_in_car']['photos'], list):
            client['bot_data']['trade_in_car']['photos'] = []

        client_dir = os.path.join(DOC_DIR, chat_id)
        os.makedirs(client_dir, exist_ok=True)
        
        photos = client['bot_data']['trade_in_car']['photos']
        
        if 'trade_in_photos' in request.files:
            files = request.files.getlist('trade_in_photos')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                    filename = f"trade_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    photos.append(f"documents/{chat_id}/{filename}")
        
        client['bot_data']['trade_in_car']['photos'] = photos
        save_clientes(clientes_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fotos de troca adicionadas para o cliente: {chat_id}")
        return jsonify({"message": "Fotos da troca adicionadas com sucesso", "photos": photos}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao adicionar fotos de troca para o cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao adicionar fotos de troca: {str(e)}"}), 500

@app.route('/status')
def get_status():
    try:
        return jsonify({"isReady": False}), 200
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Erro ao verificar status: {str(e)}")
        return jsonify({"error": f"Erro ao verificar status: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)