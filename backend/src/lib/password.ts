import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verify(password: string, hashValue: string): Promise<boolean> {
  return bcrypt.compare(password, hashValue);
}