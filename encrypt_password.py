
from api.core.encryption import password_encryptor

# ##################################################################
# # 请在这里输入您的数据库密码明文
# ##################################################################
plain_password = "YOUR_PASSWORD_HERE"
# ##################################################################

if plain_password == "YOUR_PASSWORD_HERE":
    print("请先在脚本中填入您的数据库密码明文。")
else:
    encrypted_password = password_encryptor.encrypt_password(plain_password)
    print(f"加密后的密码是: {encrypted_password}")
