from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()


def hash_password(pwd: str, salt: bytes) -> str:
    return password_hash.hash(pwd, salt=salt)
