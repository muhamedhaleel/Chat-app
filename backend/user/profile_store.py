import json
import os

STORE_FILE = os.path.join(os.path.dirname(__file__), 'profile_store.json')


def get_extra_profile(user_id):
    if not os.path.exists(STORE_FILE):
        return {'bio': '', 'gender': ''}
    try:
        with open(STORE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get(str(user_id), {'bio': '', 'gender': ''})
    except Exception:
        return {'bio': '', 'gender': ''}


def set_extra_profile(user_id, bio=None, gender=None):
    data = {}
    if os.path.exists(STORE_FILE):
        try:
            with open(STORE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            data = {}

    uid = str(user_id)
    if uid not in data:
        data[uid] = {'bio': '', 'gender': ''}

    if bio is not None:
        data[uid]['bio'] = bio
    if gender is not None:
        data[uid]['gender'] = gender

    try:
        with open(STORE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
    return data[uid]
