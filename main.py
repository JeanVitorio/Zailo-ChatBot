from flask import Flask, request, jsonify, send_from_directory
import os
import json
import uuid
import shutil
import sqlite3
from datetime import datetime

app = Flask(__name__)

# Middleware CORS
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    return response

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAR_DIR = os.path.join(BASE_DIR, 'cars')
CARROS_JSON = os.path.join(BASE_DIR, 'carros.json')
if not os.path.exists(CAR_DIR):
    os.makedirs(CAR_DIR)

# Inicializar banco de dados
def init_db():
    conn = sqlite3.connect('weiss_multimarcas.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clients (
            chat_id TEXT PRIMARY KEY,
            message TEXT,
            response TEXT,
            interests TEXT,
            state TEXT,
            last_interaction TIMESTAMP,
            report TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# Carregar e salvar carros.json
def load_carros():
    if os.path.exists(CARROS_JSON):
        try:
            with open(CARROS_JSON, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Erro ao carregar JSON: {e}")
            return {"modelos": [], "numeros_para_contato": []}
    return {"modelos": [], "numeros_para_contato": []}

def save_carros(data):
    try:
        with open(CARROS_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar JSON: {e}")
        raise

carros_data = load_carros()

@app.route('/api/cars', methods=['GET'])
def get_cars():
    return jsonify(carros_data)

@app.route('/api/cars', methods=['POST'])
def add_car():
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
    
    print(f"Arquivos recebidos: {request.files.getlist('images')}")  # Log para verificar os arquivos
    if 'images' in request.files:
        files = request.files.getlist('images')
        print(f"Número de arquivos: {len(files)}")  # Log do número de arquivos
        for i, file in enumerate(files, 1):
            if file and file.filename:  # Verifica se o arquivo existe
                # Garante que o nome do arquivo seja único e compatível com o sistema
                filename = f"image_{i}_{uuid.uuid4().hex}.{file.filename.split('.')[-1].lower()}"
                filepath = os.path.join(car_dir, filename)
                try:
                    file.save(filepath)
                    print(f"Imagem salva em: {filepath}")  # Log do caminho salvo
                    # Usa barras normais para consistência no JSON
                    new_car['imagens'].append(f"cars/{car_id}/{filename}")
                except Exception as e:
                    print(f"Erro ao salvar imagem {filename}: {e}")
                    continue  # Pula para a próxima imagem em caso de erro
    
    carros_data['modelos'].append(new_car)
    save_carros(carros_data)
    return jsonify(new_car), 201

@app.route('/api/cars/<car_id>', methods=['PUT'])
def update_car(car_id):
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
                    filename = f"image_{i}.{file.filename.split('.')[-1]}"
                    filepath = os.path.join(car_dir, filename)
                    file.save(filepath)
                    car['imagens'].append(f"cars/{car_id}/{filename}")
    
    save_carros(carros_data)
    return jsonify(car), 200

@app.route('/api/cars/<car_id>', methods=['DELETE'])
def delete_car(car_id):
    global carros_data
    try:
        car_to_delete = next((c for c in carros_data['modelos'] if c.get('id') == car_id), None)
        if not car_to_delete:
            return jsonify({"error": "Carro não encontrado"}), 404
        carros_data['modelos'] = [c for c in carros_data['modelos'] if c.get('id') != car_id]

        car_dir = os.path.join(CAR_DIR, car_id)
        if os.path.exists(car_dir):
            shutil.rmtree(car_dir)
        save_carros(carros_data)
        return jsonify({"message": "Carro removido"}), 200
    except Exception as e:
        return jsonify({"error": f"Erro ao deletar carro: {str(e)}"}), 500

@app.route('/api/cars/<car_id>/images/<int:image_index>', methods=['DELETE'])
def delete_car_image(car_id, image_index):
    global carros_data
    try:
        car = next((c for c in carros_data['modelos'] if c.get('id') == car_id), None)
        if not car:
            return jsonify({"error": "Carro não encontrado"}), 404
        
        if not car.get('imagens') or image_index < 0 or image_index >= len(car['imagens']):
            return jsonify({"error": "Índice de imagem inválido"}), 400
        
        image_path = car['imagens'].pop(image_index)
        full_path = os.path.join(BASE_DIR, image_path.replace('cars/', ''))
        if os.path.exists(full_path):
            os.remove(full_path)
        save_carros(carros_data)
        return jsonify({"message": "Imagem removida", "imagens_restantes": car['imagens']}), 200
    except Exception as e:
        return jsonify({"error": f"Erro ao deletar imagem: {str(e)}"}), 500

@app.route('/api/clients', methods=['GET'])
def get_clients():
    conn = sqlite3.connect('weiss_multimarcas.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM clients')
    clients = [{'chat_id': row[0], 'message': row[1], 'response': row[2], 'interests': json.loads(row[3]) if row[3] else [], 'state': row[4], 'last_interaction': row[5], 'report': row[6]} for row in cursor.fetchall()]
    conn.close()
    return jsonify(clients)

@app.route('/api/clients', methods=['POST'])
def add_client():
    client_data = request.json
    chat_id = client_data.get('chat_id', str(uuid.uuid4()))
    interests = client_data.get('interests', {})
    state = client_data.get('state', 'inicial')
    report = client_data.get('report', 'Conversa iniciada')
    
    conn = sqlite3.connect('weiss_multimarcas.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO clients (chat_id, message, response, interests, state, last_interaction, report)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (chat_id, client_data.get('message', ''), client_data.get('response', ''), json.dumps(interests), state, datetime.now(), report))
    conn.commit()
    conn.close()
    
    return jsonify({'chat_id': chat_id, 'state': state, 'interests': interests, 'report': report}), 201

@app.route('/api/clients/<chat_id>', methods=['PUT'])
def update_client(chat_id):
    client_data = request.json
    conn = sqlite3.connect('weiss_multimarcas.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM clients WHERE chat_id = ?', (chat_id,))
    client = cursor.fetchone()
    if not client:
        conn.close()
        return jsonify({"error": "Cliente não encontrado"}), 404
    
    cursor.execute('''
        UPDATE clients SET
            message = ?,
            response = ?,
            interests = ?,
            state = ?,
            last_interaction = ?,
            report = ?
        WHERE chat_id = ?
    ''', (client_data.get('message', client[1]), client_data.get('response', client[2]), json.dumps(client_data.get('interests', json.loads(client[3]) if client[3] else {})), client_data.get('state', client[4]), datetime.now(), client_data.get('report', client[6]), chat_id))
    conn.commit()
    conn.close()
    
    return jsonify(client_data), 200

@app.route('/api/clients/<chat_id>', methods=['DELETE'])
def delete_client(chat_id):
    conn = sqlite3.connect('weiss_multimarcas.db')
    cursor = conn.cursor()
    cursor.execute('DELETE FROM clients WHERE chat_id = ?', (chat_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    if deleted:
        return jsonify({"message": "Cliente removido"}), 200
    return jsonify({"error": "Cliente não encontrado"}), 404

@app.route('/cars/<car_id>/<path:filename>')
def serve_image(car_id, filename):
    try:
        return send_from_directory(os.path.join(CAR_DIR, car_id), filename)
    except FileNotFoundError:
        print(f"Imagem não encontrada: {os.path.join(CAR_DIR, car_id, filename)}")
        return jsonify({"error": "Imagem não encontrada"}), 404

@app.route('/QRCODE/<path:filename>')
def serve_qrcode(filename):
    qrcode_dir = os.path.join(BASE_DIR, 'QRCODE')
    try:
        return send_from_directory(qrcode_dir, filename)
    except FileNotFoundError:
        print(f"QR Code não encontrado: {os.path.join(qrcode_dir, filename)}")
        return jsonify({"error": "QR Code não encontrado"}), 404

@app.route('/status')
def bot_status():
    return jsonify({"isReady": False})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)