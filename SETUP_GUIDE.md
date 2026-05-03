# PRO Project Setup Guide

Is project ko setup karne ke liye niche diye gaye steps follow karein.

## 1. Prerequisites (Zaroori Cheezein)
- **Python 3.8+**: Make sure aapke computer mein Python installed ho.
- **MongoDB**: Local MongoDB install karein ya [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) use karein.
- **Git**: Repo clone karne ke liye.

## 2. Project Clone Karein
Sab se pehle repository ko clone karein:
```bash
git clone <repository-url>
cd "PRO -Hospital Management 2"
```

## 3. Virtual Environment Banayein
Project ke dependencies ko alag rakhne ke liye virtual environment zaroori hai:
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

## 4. Dependencies Install Karein
Saari zaroori libraries install karne ke liye ye command chalayein:
```bash
pip install -r requirements.txt
```
*Note: Agar `requirements.txt` mein koi error aaye, to manually ye libraries install karein:*
`pip install flask flask-pymongo pymongo[srv] dnspython pandas openpyxl python-dotenv werkzeug itsdangerous gunicorn flask-limiter flask-talisman flask-cors`

## 5. Environment Variables Setup (`.env`)
Project root mein aik `.env` file banayein (ya `.env.example` ko copy karke rename karein) aur ye values fill karein:

```env
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/hospital_management
SECRET_KEY=aapka_koi_bhi_random_secret_string
GMAIL_USER=aapka-email@gmail.com
GMAIL_APP_PASSWORD=aapka-gmail-app-password
ADMIN_EMAIL=admin@example.com
```

### Gmail App Password Kaise Banayein?
1. Google Account settings mein jayein.
2. **2-Step Verification** enable karein.
3. Search karein **"App Passwords"**.
4. App name dein (e.g., "PRO HMS") aur code generate karein. Wo code `.env` file mein paste karein.

## 6. Project Run Karein
Ab project ko start karne ke liye:
```bash
python app.py
```
App `http://127.0.0.1:5000` par chalne lagegi.

## 7. Pehli Baar Login Karne Ka Tarika
Jab aap pehli baar project run karenge aur database empty hoga, to system aik default admin account banayega:
- **Username**: `ImranSaab`
- **Password**: `password123`

Login karne ke baad foran apna password change kar lein.

---

## Deployment (Bonus)
- **Render**: `render.yaml` file use karein.
- **Vercel**: `vercel.json` file use karein.
- **Gunicorn**: Production ke liye `gunicorn app:app` use karein.
