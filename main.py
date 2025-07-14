from flask import Flask, request, jsonify, send_from_directory, send_file
import os
import json
import uuid
import shutil
from bancodedados import Database

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
CLIENTES_JSON = os.path.join(BASE_DIR, 'clientes.json')
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
QRCODE_DIR = os.path.join(BASE_DIR, 'QRCODE')

# Criar diretórios se não existirem
for directory in [CAR_DIR, DOC_DIR, TEMPLATES_DIR, QRCODE_DIR]:
    os.makedirs(directory, exist_ok=True)

# Inicializar banco de dados
db = Database()

# Funções para carregar e salvar JSON
def load_carros():
    if os.path.exists(CARROS_JSON):
        try:
            with open(CARROS_JSON, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Erro ao carregar carros.json: {e}")
            return {"modelos": [], "numeros_para_contato": []}
    return {"modelos": [], "numeros_para_contato": []}

def save_carros(data):
    try:
        with open(CARROS_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar carros.json: {e}")
        raise

def load_clientes():
    if os.path.exists(CLIENTES_JSON):
        try:
            with open(CLIENTES_JSON, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Erro ao carregar clientes.json: {e}")
            return {"clients": []}
    return {"clients": []}

def save_clientes(data):
    try:
        with open(CLIENTES_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar clientes.json: {e}")
        raise

carros_data = load_carros()
clientes_data = load_clientes()

# Sincronizar cliente do clientes.json com o banco de dados
def sync_client_to_db(chat_id):
    try:
        client_data = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if client_data and not db.get_client(chat_id):
            interests = {
                "name": client_data.get('name', ''),
                "phone": client_data.get('phone', ''),
                "job": client_data.get('job', ''),
                "documents": {
                    "cpf": client_data.get('cpf', ''),
                    "incomeProof": client_data.get('incomeProof', []),
                    "rg": client_data.get('rg', [])
                }
            }
            documents = []
            if client_data.get('incomeProof'):
                documents.append(client_data['incomeProof'])
            if client_data.get('rg'):
                documents.append(client_data['rg'])
            success = db.add_client(
                chat_id=chat_id,
                message=client_data.get('message', ''),
                response=client_data.get('response', ''),
                interests=interests,
                state=client_data.get('state', 'inicial'),
                report=client_data.get('report', 'Cliente sincronizado do clientes.json'),
                documents=documents,
                name=client_data.get('name', ''),
                phone=client_data.get('phone', ''),
                cpf=client_data.get('cpf', ''),
                job=client_data.get('job', '')
            )
            if not success:
                print(f"Erro ao sincronizar cliente {chat_id} com o banco de dados")
            return success
        return False
    except Exception as e:
        print(f"Erro ao sincronizar cliente {chat_id}: {str(e)}")
        return False

# Rotas da API
@app.route('/', methods=['GET'])
def serve_index():
    try:
        return send_file(os.path.join(TEMPLATES_DIR, 'index.html'))
    except Exception as e:
        print(f"Erro ao servir index.html: {str(e)}")
        return jsonify({"error": "Erro ao carregar página inicial"}), 500

@app.route('/api/cars', methods=['GET'])
def get_cars():
    try:
        return jsonify(carros_data), 200
    except Exception as e:
        print(f"Erro ao obter carros: {str(e)}")
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
                            print(f"Erro ao salvar imagem {filename}: {e}")
                            continue
        
        carros_data['modelos'].append(new_car)
        save_carros(carros_data)
        
        # Adicionar ao banco de dados
        db.add_car(
            name=name,
            year=car_data.get('year', ''),
            description=car_data.get('description', ''),
            price=car_data.get('price', 'R$ 0'),
            images=new_car['imagens']
        )
        
        return jsonify(new_car), 201
    except Exception as e:
        print(f"Erro ao adicionar carro: {str(e)}")
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
        
        # Atualizar no banco de dados
        db.add_car(
            name=car['nome'],
            year=car['ano'],
            description=car['descricao'],
            price=car['preco'],
            images=car['imagens']
        )
        
        return jsonify(car), 200
    except Exception as e:
        print(f"Erro ao atualizar carro {car_id}: {str(e)}")
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
        
        # Deletar do banco de dados
        db.delete_car(car_id)
        
        return jsonify({"message": "Carro removido com sucesso"}), 200
    except Exception as e:
        print(f"Erro ao deletar carro {car_id}: {str(e)}")
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
        
        # Atualizar no banco de dados
        db.add_car(
            name=car['nome'],
            year=car['ano'],
            description=car['descricao'],
            price=car['preco'],
            images=car['imagens']
        )
        
        return jsonify({"message": "Imagem removida com sucesso", "imagens_restantes": car['imagens']}), 200
    except Exception as e:
        print(f"Erro ao deletar imagem do carro {car_id}: {str(e)}")
        return jsonify({"error": f"Erro ao deletar imagem: {str(e)}"}), 500

@app.route('/api/clients', methods=['GET'])
def get_clients():
    try:
        return jsonify(db.get_clientes_data()), 200
    except Exception as e:
        print(f"Erro ao obter clientes: {str(e)}")
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
        
        phone = client_data.get('phone', interests.get('phone', ''))
        cpf = client_data.get('cpf', interests.get('documents', {}).get('cpf', ''))
        job = client_data.get('job', interests.get('job', ''))
        
        success = db.add_client(
            chat_id=chat_id,
            message=client_data.get('message', ''),
            response=client_data.get('response', ''),
            interests=interests,
            state=client_data.get('state', 'inicial'),
            report=client_data.get('report', 'Cliente adicionado manualmente'),
            documents=documents,
            name=name,
            phone=phone,
            cpf=cpf,
            job=job
        )
        if not success:
            return jsonify({"error": "Erro ao adicionar cliente no banco de dados"}), 500
        
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
        
        if 'rg' in request.files:
            files = request.files.getlist('rg')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"rg_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
        
        if documents:
            success = db.update_client(
                chat_id=chat_id,
                message=client_data.get('message', ''),
                response=client_data.get('response', ''),
                interests=interests,
                state=client_data.get('state', 'inicial'),
                report=client_data.get('report', 'Cliente atualizado com documentos'),
                documents=documents,
                name=name,
                phone=phone,
                cpf=cpf,
                job=job
            )
            if not success:
                return jsonify({"error": "Erro ao atualizar documentos no banco de dados"}), 500
        
        # Atualizar clientes.json
        client_data_json = {
            'chat_id': chat_id,
            'name': name,
            'phone': phone,
            'cpf': cpf,
            'job': job,
            'message': client_data.get('message', ''),
            'response': client_data.get('response', ''),
            'interests': interests,
            'state': client_data.get('state', 'inicial'),
            'report': client_data.get('report', 'Cliente adicionado manualmente'),
            'documents': documents
        }
        clientes_data['clients'].append(client_data_json)
        save_clientes(clientes_data)
        
        return jsonify(client_data_json), 201
    except Exception as e:
        print(f"Erro ao adicionar cliente: {str(e)}")
        return jsonify({"error": f"Erro ao adicionar cliente: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>', methods=['GET'])
def get_client(chat_id):
    try:
        # Tentar sincronizar cliente do clientes.json com o banco de dados
        sync_client_to_db(chat_id)
        client = db.get_client(chat_id)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        return jsonify(client), 200
    except Exception as e:
        print(f"Erro ao obter cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao obter cliente: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>', methods=['PUT'])
def update_client(chat_id):
    try:
        # Verificar se o cliente existe no clientes.json e sincronizar com o banco de dados
        sync_client_to_db(chat_id)
        
        client_data = request.get_json(silent=True) or request.form.to_dict()
        interests = client_data.get('interests', {})
        if isinstance(interests, str):
            try:
                interests = json.loads(interests)
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Erro ao parsear interests: {str(e)}"}), 400
        
        client = db.get_client(chat_id)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        
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
        
        if 'rg' in request.files:
            files = request.files.getlist('rg')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"rg_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
        
        success = db.update_client(
            chat_id=chat_id,
            message=client_data.get('message', client.get('message', '')),
            response=client_data.get('response', client.get('response', '')),
            interests=interests or client.get('interests', {}),
            state=state,
            report=client_data.get('report', client.get('report', '')),
            documents=documents,
            name=name,
            phone=phone,
            cpf=cpf,
            job=job
        )
        if not success:
            return jsonify({"error": "Erro ao atualizar cliente no banco de dados"}), 500
        
        # Atualizar clientes.json
        client_data_json = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if client_data_json:
            client_data_json.update({
                'name': name,
                'phone': phone,
                'cpf': cpf,
                'job': job,
                'message': client_data.get('message', client.get('message', '')),
                'response': client_data.get('response', client.get('response', '')),
                'interests': interests or client.get('interests', {}),
                'state': state,
                'report': client_data.get('report', client.get('report', '')),
                'documents': documents
            })
        else:
            new_client = {
                'chat_id': chat_id,
                'name': name,
                'phone': phone,
                'cpf': cpf,
                'job': job,
                'message': client_data.get('message', ''),
                'response': client_data.get('response', ''),
                'interests': interests,
                'state': state,
                'report': client_data.get('report', ''),
                'documents': documents
            }
            clientes_data['clients'].append(new_client)
        save_clientes(clientes_data)
        
        return jsonify(client_data_json or new_client), 200
    except Exception as e:
        print(f"Erro ao atualizar cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao atualizar cliente: {str(e)}"}), 500

@app.route('/api/clients/<chat_id>/files', methods=['POST'])
def upload_client_files(chat_id):
    try:
        client = db.get_client(chat_id)
        if not client:
            return jsonify({"error": "Cliente não encontrado"}), 404
        
        client_dir = os.path.join(DOC_DIR, chat_id)
        os.makedirs(client_dir, exist_ok=True)
        documents = client.get('documents', [])
        
        if 'incomeProof' in request.files:
            files = request.files.getlist('incomeProof')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"income_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
        
        if 'rg' in request.files:
            files = request.files.getlist('rg')
            for file in files:
                if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                    filename = f"rg_{uuid.uuid4().hex}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(client_dir, filename)
                    file.save(filepath)
                    documents.append(f"documents/{chat_id}/{filename}")
        
        success = db.update_client(
            chat_id=chat_id,
            message=client.get('message', ''),
            response=client.get('response', ''),
            interests=client.get('interests', {}),
            state=client.get('state', 'inicial'),
            report=client.get('report', 'Arquivos adicionados'),
            documents=documents,
            name=client.get('name', ''),
            phone=client.get('phone', ''),
            cpf=client.get('cpf', ''),
            job=client.get('job', '')
        )
        if not success:
            return jsonify({"error": "Erro ao atualizar documentos no banco de dados"}), 500
        
        # Atualizar clientes.json
        client_data_json = next((c for c in clientes_data['clients'] if c['chat_id'] == chat_id), None)
        if client_data_json:
            client_data_json['documents'] = documents
            save_clientes(clientes_data)
        
        return jsonify({"message": "Arquivos enviados com sucesso", "documents": documents}), 200
    except Exception as e:
        print(f"Erro ao enviar arquivos para cliente {chat_id}: {str(e)}")
        return jsonify({"error": f"Erro ao enviar arquivos: {str(e)}"}), 500

@app.route('/cars/<path:path>')
def serve_car_images(path):
    try:
        return send_from_directory(CAR_DIR, path)
    except Exception as e:
        print(f"Erro ao servir imagem do carro {path}: {str(e)}")
        return jsonify({"error": "Imagem não encontrada"}), 404

@app.route('/documents/<path:path>')
def serve_client_documents(path):
    try:
        return send_from_directory(DOC_DIR, path)
    except Exception as e:
        print(f"Erro ao servir documento do cliente {path}: {str(e)}")
        return jsonify({"error": "Documento não encontrado"}), 404

@app.route('/QRCODE/<path:path>')
def serve_qrcode(path):
    try:
        return send_from_directory(QRCODE_DIR, path)
    except Exception as e:
        print(f"Erro ao servir QR code {path}: {str(e)}")
        return jsonify({"error": "QR code não encontrado"}), 404

@app.route('/status')
def get_status():
    try:
        # Placeholder para verificar o status da conexão com o WhatsApp
        return jsonify({"isReady": False}), 200
    except Exception as e:
        print(f"Erro ao verificar status: {str(e)}")
        return jsonify({"error": f"Erro ao verificar status: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)