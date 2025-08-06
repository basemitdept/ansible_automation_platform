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
  SafetyOutlined,
  LoginOutlined
} from '@ant-design/icons';
import { authAPI } from '../services/api';

const { Title, Text, Paragraph } = Typography;

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
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
            color: 'white',
            padding: '40px 20px'
          }}>
            <div style={{ marginBottom: '30px' }}>
              <RocketOutlined style={{ 
                fontSize: '80px', 
                color: 'white',
                marginBottom: '20px',
                display: 'block'
              }} />
              <Title level={1} style={{ 
                color: 'white', 
                margin: 0,
                fontSize: '48px',
                fontWeight: 'bold'
              }}>
                Ansible Automation Platform
              </Title>
            </div>
            
            <Paragraph style={{ 
              color: 'rgba(255, 255, 255, 0.9)', 
              fontSize: '20px',
              lineHeight: '1.6',
              marginBottom: '30px'
            }}>
              Automate your infrastructure with confidence. Execute playbooks, 
              manage hosts, and monitor your automation workflow with our 
              powerful web-based platform.
            </Paragraph>

            <div style={{ marginTop: '40px' }}>
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SafetyOutlined style={{ fontSize: '24px', marginRight: '12px' }} />
                  <Text style={{ color: 'white', fontSize: '16px' }}>
                    Secure Authentication & Role-Based Access
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RocketOutlined style={{ fontSize: '24px', marginRight: '12px' }} />
                  <Text style={{ color: 'white', fontSize: '16px' }}>
                    Real-time Monitoring & Execution Tracking
                  </Text>
                </div>
              </Space>
            </div>
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
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
                border: 'none'
              }}
              bodyStyle={{ padding: '40px' }}
            >
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <LoginOutlined style={{ 
                  fontSize: '48px', 
                  color: '#1890ff',
                  marginBottom: '16px'
                }} />
                <Title level={2} style={{ margin: 0, color: '#262626' }}>
                  Welcome Back
                </Title>
                <Text type="secondary" style={{ fontSize: '16px' }}>
                  Sign in to your account
                </Text>
              </div>

              {error && (
                <Alert
                  message={error}
                  type="error"
                  style={{ marginBottom: '20px' }}
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
                    prefix={<UserOutlined style={{ color: '#1890ff' }} />}
                    placeholder="Enter your username"
                    style={{ borderRadius: '8px' }}
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
                    prefix={<LockOutlined style={{ color: '#1890ff' }} />}
                    placeholder="Enter your password"
                    style={{ borderRadius: '8px' }}
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