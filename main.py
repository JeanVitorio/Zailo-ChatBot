from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import uuid
import shutil
from bancodedados import Database

app = Flask(__name__)
CORS(app)
db = Database()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAR_DIR = os.path.join(BASE_DIR, 'cars')
CLIENT_DATA_FILE = os.path.join(BASE_DIR, 'clients.json')
if not os.path.exists(CAR_DIR):
    os.makedirs(CAR_DIR)

# Carregar dados iniciais
def load_data():
    if os.path.exists(CLIENT_DATA_FILE):
        with open(CLIENT_DATA_FILE, 'r') as f:
            return json.load(f)
    return {"cars": [], "clients": []}

data = load_data()

@app.route('/api/cars', methods=['GET'])
def get_cars():
    return jsonify(data['cars'])

@app.route('/api/cars', methods=['POST'])
def add_car():
    car_data = request.form
    name = car_data.get('name')
    if not name:
        return jsonify({"error": "Nome do carro é obrigatório"}), 400
    
    car_id = str(uuid.uuid4())
    car_dir = os.path.join(CAR_DIR, car_id)
    os.makedirs(car_dir, exist_ok=True)
    
    new_car = {
        "id": car_id,
        "name": name,
        "year": car_data.get('year', ''),
        "description": car_data.get('description', ''),
        "images": []
    }
    
    if 'images' in request.files:
        files = request.files.getlist('images')
        for i, file in enumerate(files, 1):
            if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                filename = f"image_{i}.{file.filename.split('.')[-1]}"
                file.save(os.path.join(car_dir, filename))
                new_car['images'].append(os.path.join(car_id, filename))
    
    data['cars'].append(new_car)
    save_data()
    db.add_car(name, new_car['year'], new_car['description'], '', new_car['images'])
    return jsonify(new_car), 201

@app.route('/api/cars/<car_id>', methods=['PUT'])
def update_car(car_id):
    car_data = request.form
    car = next((c for c in data['cars'] if c['id'] == car_id), None)
    if not car:
        return jsonify({"error": "Carro não encontrado"}), 404
    
    car['name'] = car_data.get('name', car['name'])
    car['year'] = car_data.get('year', car['year'])
    car['description'] = car_data.get('description', car['description'])
    
    if 'images' in request.files:
        car_dir = os.path.join(CAR_DIR, car_id)
        files = request.files.getlist('images')
        car['images'] = []
        for i, file in enumerate(files, 1):
            if file and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                filename = f"image_{i}.{file.filename.split('.')[-1]}"
                file.save(os.path.join(car_dir, filename))
                car['images'].append(os.path.join(car_id, filename))
    
    save_data()
    db.add_car(car['name'], car['year'], car['description'], '', car['images'])
    return jsonify(car), 200

@app.route('/api/cars/<car_id>', methods=['DELETE'])
def delete_car(car_id):
    global data
    data['cars'] = [c for c in data['cars'] if c['id'] != car_id]
    car_dir = os.path.join(CAR_DIR, car_id)
    if os.path.exists(car_dir):
        shutil.rmtree(car_dir)
    db.delete_car(car_id)
    save_data()
    return jsonify({"message": "Carro removido"}), 200

@app.route('/api/clients', methods=['GET'])
def get_clients():
    return jsonify(data['clients'])

@app.route('/api/clients', methods=['POST'])
def add_client():
    client_data = request.json
    client_data['id'] = str(uuid.uuid4())
    client_data['interests'] = client_data.get('interests', {})
    client_data['documents'] = client_data.get('documents', {})
    client_data['job'] = client_data.get('job', '')
    client_data['state'] = client_data.get('state', 'inicial')
    client_data['report'] = client_data.get('report', 'Relatório inicial')
    data['clients'].append(client_data)
    save_data()
    db.add_client(client_data['id'], '', '', client_data['interests'], client_data['state'])
    return jsonify(client_data), 201

@app.route('/api/clients/<client_id>', methods=['PUT'])
def update_client(client_id):
    client_data = request.json
    client = next((c for c in data['clients'] if c['id'] == client_id), None)
    if not client:
        return jsonify({"error": "Cliente não encontrado"}), 404
    
    client.update(client_data)
    save_data()
    db.add_client(client_id, '', '', client_data.get('interests', {}), client_data.get('state', 'inicial'))
    return jsonify(client), 200

@app.route('/api/clients/<client_id>', methods=['DELETE'])
def delete_client(client_id):
    global data
    data['clients'] = [c for c in data['clients'] if c['id'] != client_id]
    db.delete_client(client_id)
    save_data()
    return jsonify({"message": "Cliente removido"}), 200

@app.route('/cars/<path:filename>')
def serve_image(filename):
    return send_from_directory(CAR_DIR, filename)

@app.route('/qrcode')
def get_qrcode():
    return jsonify({"qrcode": "Simulated QR Code URL"})  # Placeholder

def save_data():
    with open(CLIENT_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)