import subprocess
import threading
import time
import os
import sys
import socket
import logging
import webview
import tkinter as tk
from tkinter import messagebox
import traceback

# 🔹 Garantir que o script sempre rode no diretório correto
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Configurar logging para debug
logging.basicConfig(filename='app.log', level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Função para mostrar erro em pop-up
def show_error(title, message):
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(title, message)
    root.destroy()

# Ajustar caminhos para o ambiente
def resource_path(relative_path):
    base_path = os.path.abspath(os.path.dirname(__file__))
    path = os.path.join(base_path, relative_path)
    logger.debug(f"Resolvido caminho para {relative_path}: {path}")
    return path

# Verificar se Node.js está instalado
def check_node():
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True, timeout=5)
        logger.info(f"Node.js encontrado: {result.stdout.strip()}")
        return True
    except FileNotFoundError:
        logger.error("Node.js não encontrado no PATH")
        return False
    except Exception as e:
        logger.error(f"Erro ao verificar Node.js: {str(e)}")
        return False

# Importar o app Flask de main.py
try:
    from main import app
    logger.info("Importado Flask app de main.py com sucesso")
except Exception as e:
    logger.error(f"Falha ao importar Flask app: {str(e)}")
    show_error("Erro de Importação", f"Falha ao importar main.py: {str(e)}\nVerifique se main.py está no diretório.")
    raise

# Função para verificar se a porta está em uso
def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

# Função para rodar o servidor Flask
def run_flask():
    ports = [5003, 5004, 5005]
    selected_port = None
    for port in ports:
        if not is_port_in_use(port):
            try:
                logger.info(f"Iniciando servidor Flask na porta {port}")
                app.run(debug=False, use_reloader=False, host='127.0.0.1', port=port, threaded=True)
                selected_port = port
                break
            except Exception as e:
                logger.error(f"Falha ao iniciar Flask na porta {port}: {str(e)}")
        else:
            logger.warning(f"Porta {port} já em uso")
    if not selected_port:
        logger.error("Nenhuma porta disponível para o Flask")
        show_error("Erro de Porta", "Nenhuma porta disponível (5003-5005). Feche outros programas e tente novamente.")
        raise Exception("Nenhuma porta disponível")
    return selected_port

# Função para limpar recursos
def cleanup():
    global node_process
    if 'node_process' in globals():
        try:
            node_process.terminate()
            node_process.wait(timeout=5)
            logger.info("Processo Node.js encerrado com sucesso")
        except Exception as e:
            logger.error(f"Erro ao encerrar Node.js: {str(e)}")
            try:
                node_process.kill()
                logger.info("Processo Node.js forçado a encerrar")
            except:
                pass
    logger.info("Aplicação encerrada")

# Função principal
def main():
    global node_process
    logger.info("Iniciando ZailonSoft")

    # Verificar arquivos necessários
    required_files = ['index.html', 'carros.json', 'chatbotZailo.js']
    base_dir = resource_path('.')
    for file in required_files:
        file_path = resource_path(file)
        if not os.path.exists(file_path):
            logger.error(f"Arquivo {file} não encontrado em {file_path}")
            show_error("Arquivo Ausente", f"Arquivo {file} não encontrado. Coloque-o no diretório do projeto.")
            sys.exit(1)
        logger.debug(f"Arquivo {file} encontrado em {file_path}")

    # Criar clientes.json se não existir
    clientes_path = resource_path('clientes.json')
    try:
        if not os.path.exists(clientes_path):
            with open(clientes_path, 'w') as f:
                f.write('{"clients": []}')
            logger.debug("Criado clientes.json")
        else:
            logger.debug("clientes.json já existe")
    except Exception as e:
        logger.error(f"Falha ao criar/copiar clientes.json: {str(e)}")
        show_error("Erro de Arquivo", f"Falha ao criar clientes.json: {str(e)}")
        sys.exit(1)

    # Garantir que diretórios existam
    for dir_name in ['QRCODE', 'cars', 'documents', 'templates']:
        dir_path = os.path.join(base_dir, dir_name)
        try:
            os.makedirs(dir_path, exist_ok=True)
            logger.debug(f"Criado diretório: {dir_path}")
        except Exception as e:
            logger.error(f"Falha ao criar diretório {dir_path}: {str(e)}")
            show_error("Erro de Diretório", f"Falha ao criar diretório {dir_name}: {str(e)}")
            sys.exit(1)

    # Copiar index.html para templates se necessário
    html_path = resource_path('index.html')
    templates_dir = os.path.join(base_dir, 'templates')
    try:
        if not os.path.exists(os.path.join(templates_dir, 'index.html')):
            with open(html_path, 'rb') as src, open(os.path.join(templates_dir, 'index.html'), 'wb') as dst:
                dst.write(src.read())
            logger.debug("Copiado index.html para templates")
        else:
            logger.debug("index.html já existe em templates")
    except Exception as e:
        logger.error(f"Falha ao copiar index.html: {str(e)}")
        show_error("Erro de Arquivo", f"Falha ao copiar index.html: {str(e)}")
        sys.exit(1)

    # Iniciar Flask em uma thread
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()
    logger.info("Thread do Flask iniciada")

    # Aguardar o Flask iniciar
    time.sleep(5)

    # Verificar e iniciar o bot Node.js
    if not check_node():
        logger.error("Node.js não está instalado ou não está no PATH")
        show_error("Erro de Node.js", "Node.js não encontrado. Instale-o em https://nodejs.org/ (versão 18.x).")
        sys.exit(1)

    node_script = resource_path('chatbotZailo.js')
    try:
        logger.info(f"Iniciando bot Node.js: {node_script}")
        node_process = subprocess.Popen(['node', node_script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = node_process.communicate(timeout=10)
        if stdout:
            logger.debug(f"Node.js stdout: {stdout}")
        if stderr:
            logger.error(f"Node.js stderr: {stderr}")
            show_error("Erro no Bot", f"Erro ao iniciar o bot WhatsApp: {stderr}")
    except FileNotFoundError:
        logger.error("Executável 'node' não encontrado no PATH")
        show_error("Erro de Node.js", "Node.js não encontrado. Instale-o em https://nodejs.org/ (versão 18.x).")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Falha ao iniciar bot Node.js: {str(e)}")
        show_error("Erro no Bot", f"Falha ao iniciar o bot WhatsApp: {str(e)}")
        sys.exit(1)

    # Iniciar a janela com pywebview
    try:
        logger.info("Iniciando janela pywebview")
        webview.create_window("ZailonSoft Dashboard", "http://127.0.0.1:5003", width=1400, height=800, resizable=True)
        backends = ['qt', 'cef']
        for backend in backends:
            try:
                logger.info(f"Tentando backend pywebview: {backend}")
                webview.start(gui=backend)
                break
            except Exception as e:
                logger.error(f"Falha ao iniciar pywebview com backend {backend}: {str(e)}")
                if backend == backends[-1]:
                    show_error("Erro no Pywebview", f"Falha ao iniciar a interface: {str(e)}\nInstale pywebview[qt,cef] e verifique se o Microsoft Edge está instalado.")
                    sys.exit(1)
        logger.info("Janela pywebview fechada")
    except Exception as e:
        logger.error(f"Falha geral ao iniciar pywebview: {str(e)}")
        show_error("Erro no Pywebview", f"Falha ao iniciar a interface: {str(e)}\nInstale pywebview[qt,cef] e verifique se o Microsoft Edge está instalado.")
        sys.exit(1)
    finally:
        cleanup()

if __name__ == '__main__':
    try:
        with open('early_log.txt', 'w') as f:
            f.write("Launcher iniciado\n")
        logger.info("Launcher iniciado")
        main()
    except KeyboardInterrupt:
        cleanup()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Erro crítico no launcher: {str(e)}")
        traceback.print_exc()
        show_error("Erro Crítico", f"Erro ao iniciar o ZailonSoft: {str(e)}\nVerifique app.log para detalhes.")
        input("\nPressione Enter para sair...")
        sys.exit(1)
