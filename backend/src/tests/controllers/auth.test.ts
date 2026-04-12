import request from 'supertest';
import express from 'express';
import User from '../../models/user.model';
import authController from '../../controllers/auth.controller';

const app = express();
app.use(express.json());
app.post('/register', authController.register);
app.post('/login', authController.login);

describe('AuthController', () => {
  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.password).toBeUndefined();
    });

    it('should return error for duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };

      // Create user first
      await User.create({
        ...userData,
        password: 'hashedpassword'
      });

      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(400);

      expect(response.body.message).toBe('User already exists with this email');
    });
  });

  describe('POST /login', () => {
    it('should login user with valid credentials', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
      await user.save();

      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should return error for invalid credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });
  });
});