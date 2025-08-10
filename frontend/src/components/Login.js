import React, { useState } from 'react';
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  Alert,
  Space,
  Row,
  Col,
  Divider
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  RocketOutlined,
  LoginOutlined
} from '@ant-design/icons';
import { authAPI } from '../services/api';

const { Title, Text } = Typography;

const Login = ({ onLoginSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (values) => {
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.login(values.username, values.password);
      
      // Store the token in localStorage
      localStorage.setItem('authToken', response.data.access_token);
      localStorage.setItem('currentUser', JSON.stringify(response.data.user));
      
      // Call the success callback
      onLoginSuccess(response.data.user, response.data.access_token);
      
    } catch (error) {
      console.error('Login error:', error);
      setError(error.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="login-dark"
      style={{
        minHeight: '100vh',
        background: '#1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <Row gutter={[32, 32]} style={{ width: '100%', maxWidth: '1200px' }}>
        {/* Left side - Branding */}
        <Col xs={24} lg={12}>
          <div style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.95)',
            padding: '40px 20px'
          }}>
            <div style={{ marginBottom: '10px' }}>
              <RocketOutlined style={{
                fontSize: '80px',
                color: '#69b1ff',
                marginBottom: '20px',
                display: 'block'
              }} />
              <Title level={2} style={{
                color: 'rgba(255,255,255,0.98)',
                margin: 0,
                fontSize: '36px',
                fontWeight: 'bold'
              }}>
                Ansible Automation Platform
              </Title>
            </div>
            {/* Removed descriptive marketing text and feature bullets for a cleaner login */}
          </div>
        </Col>

        {/* Right side - Login form */}
        <Col xs={24} lg={12}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            minHeight: '500px'
          }}>
            <Card
              style={{
                width: '100%',
                maxWidth: '400px',
                borderRadius: '16px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
                border: '1px solid #2f2f2f',
                backgroundColor: '#2d2d2d',
                color: 'rgba(255,255,255,0.95)'
              }}
              bodyStyle={{ padding: '40px' }}
            >
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <LoginOutlined style={{ 
                  fontSize: '48px', 
                  color: '#69b1ff',
                  marginBottom: '16px'
                }} />
                <Title level={2} style={{ margin: 0, color: 'rgba(255,255,255,0.95)' }}>
                  Welcome Back
                </Title>
                <Text style={{ fontSize: '16px', color: 'rgba(255,255,255,0.65)' }}>
                  Sign in to your account
                </Text>
              </div>

              {error && (
                <Alert
                  message={error}
                  type="error"
                  style={{ marginBottom: '20px', backgroundColor: '#2b1a1a', border: '1px solid #442222', color: '#ffccc7' }}
                  showIcon
                />
              )}

              <Form
                form={form}
                name="login"
                onFinish={handleSubmit}
                layout="vertical"
                size="large"
              >
                <Form.Item
                  name="username"
                  label="Username"
                  rules={[
                    { required: true, message: 'Please enter your username' },
                    { min: 3, message: 'Username must be at least 3 characters' }
                  ]}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: '#69b1ff' }} />}
                    placeholder="Enter your username"
                    style={{ borderRadius: '8px', backgroundColor: '#1f1f1f', border: '1px solid #3a3a3a', color: '#ffffff' }}
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  label="Password"
                  rules={[
                    { required: true, message: 'Please enter your password' },
                    { min: 3, message: 'Password must be at least 3 characters' }
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#69b1ff' }} />}
                    placeholder="Enter your password"
                    style={{ borderRadius: '8px', backgroundColor: '#1f1f1f', border: '1px solid #3a3a3a', color: '#ffffff' }}
                  />
                </Form.Item>

                <Form.Item style={{ marginBottom: '20px' }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    style={{
                      width: '100%',
                      height: '48px',
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </Form.Item>
              </Form>


            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default Login;