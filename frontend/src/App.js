import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, ConfigProvider, Switch, Button, Space, Dropdown, Avatar, message } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  SunOutlined,
  MoonOutlined,
  KeyOutlined,
  LinkOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined
} from '@ant-design/icons';

import Dashboard from './components/Dashboard';
import Playbooks from './components/Playbooks';
import Hosts from './components/Hosts';
import PlaybookEditor from './components/PlaybookEditor';
import Tasks from './components/Tasks';
import History from './components/History';
import TaskDetail from './components/TaskDetail';
import Credentials from './components/Credentials';
import Webhooks from './components/Webhooks';
import Variables from './components/Variables';
import Users from './components/Users';
import Login from './components/Login';
import socketService from './services/socket';
import { authAPI } from './services/api';

const { Header, Sider, Content } = Layout;

// Light Dark Theme - Better contrast and readability
const cyberBlueTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3b82f6', // Brighter blue for better visibility
    colorInfo: '#3b82f6',
    colorBgBase: '#1a1a1a', // Lighter dark background
    colorBgLayout: '#1a1a1a',
    colorBgContainer: '#2d2d2d', // Lighter card backgrounds
    colorBgElevated: '#3a3a3a', // Lighter pop-ups, dropdowns
    colorBorder: '#4a4a4a', // Lighter borders
    colorBorderSecondary: '#3a3a3a',
    colorText: 'rgba(255, 255, 255, 0.95)', // Pure white text for better contrast
    colorTextSecondary: 'rgba(200, 200, 200, 0.85)', // Lighter secondary text
    colorTextTertiary: 'rgba(180, 180, 180, 0.7)',
    colorFillAlter: '#3a3a3a',
    colorFillContent: '#2d2d2d',
    controlItemBgActive: 'rgba(59, 130, 246, 0.25)',
    controlItemBgHover: 'rgba(255, 255, 255, 0.08)',
  },
  components: {
    Layout: {
      headerBg: '#1a1a1a',
      siderBg: '#2d2d2d',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(59, 130, 246, 0.25)',
      itemSelectedColor: '#3b82f6',
      itemHoverBg: 'rgba(59, 130, 246, 0.1)',
      itemActiveBg: 'rgba(59, 130, 246, 0.15)',
      colorBgContainer: '#000000',
      colorText: '#ffffff',
      colorTextDescription: '#cccccc',
    },
    Card: {
      colorBgContainer: '#2d2d2d',
      headerBg: 'transparent',
      colorBorderSecondary: '#3a3a3a',
    },
    Table: {
      headerBg: '#3a3a3a',
      rowHoverBg: '#4a4a4a',
      borderColor: '#4a4a4a',
    },
    Modal: {
      headerBg: '#2d2d2d',
      contentBg: '#2d2d2d',
      footerBg: 'transparent',
    },
    Input: {
      colorBgContainer: '#3a3a3a',
      activeBorderColor: '#3b82f6',
      hoverBorderColor: '#60a5fa',
    },
    Select: {
      colorBgContainer: '#3a3a3a',
      optionSelectedBg: 'rgba(59, 130, 246, 0.25)',
      colorBorder: '#4a4a4a',
      colorPrimaryHover: '#60a5fa',
      colorPrimary: '#3b82f6',
      borderRadius: 6,
      controlHeight: 40,
      fontSize: 14,
      optionActiveBg: 'rgba(59, 130, 246, 0.15)',
      optionHoverBg: 'rgba(59, 130, 246, 0.1)',
      multipleItemBg: 'rgba(59, 130, 246, 0.2)',
      multipleItemBorderColor: 'rgba(59, 130, 246, 0.3)',
      multipleItemColor: '#3b82f6',
      multipleItemHoverBg: 'rgba(59, 130, 246, 0.3)',
      // Ensure proper dropdown behavior
      dropdownHeight: 300,
      zIndexPopup: 1050,
    },
    Button: {
      defaultBg: '#3a3a3a',
      defaultBorderColor: '#4a4a4a',
      defaultHoverBg: '#4a4a4a',
      defaultHoverBorderColor: '#3b82f6',
      primaryShadow: '0 2px 0 rgba(59, 130, 246, 0.15)',
    },
    Switch: {
      trackMinWidth: 44,
    }
  },
};

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Initialize from localStorage or default to false
    const savedTheme = localStorage.getItem('ansible-portal-dark-mode');
    return savedTheme ? JSON.parse(savedTheme) : false;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Save theme preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('ansible-portal-dark-mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Check authentication status on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Initialize WebSocket connection when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect();
      
      return () => {
        socketService.disconnect();
      };
    }
  }, [isAuthenticated]);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const savedUser = localStorage.getItem('currentUser');
      
      if (token && savedUser) {
        // Verify token is still valid
        const response = await authAPI.getCurrentUser();
        setCurrentUser(response.data.user);
        setIsAuthenticated(true);
      } else {
        // No token or user, redirect to login
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } catch (error) {
      // Token invalid or expired
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (user, token) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    message.success(`Welcome back, ${user.username}!`);
    navigate('/');
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      setIsAuthenticated(false);
      setCurrentUser(null);
      message.success('Logged out successfully');
      navigate('/login');
    }
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const getMenuItems = () => {
    const items = [
      {
        key: '/',
        icon: <DashboardOutlined />,
        label: 'Dashboard',
      },
      {
        key: '/playbooks',
        icon: <BookOutlined />,
        label: 'Playbooks',
      },
      {
        key: '/hosts',
        icon: <DatabaseOutlined />,
        label: 'Hosts',
      },
      {
        key: '/credentials',
        icon: <KeyOutlined />,
        label: 'Credentials',
      },
      {
        key: '/variables',
        icon: <SettingOutlined />,
        label: 'Variables',
      },
      {
        key: '/webhooks',
        icon: <LinkOutlined />,
        label: 'Webhooks',
      },
      {
        key: '/editor',
        icon: <PlayCircleOutlined />,
        label: 'Run Playbook',
      },
      {
        key: '/tasks',
        icon: <ClockCircleOutlined />,
        label: 'Running Tasks',
      },
      {
        key: '/history',
        icon: <HistoryOutlined />,
        label: 'History',
      },
    ];

    // Add Users menu item only for admin and editor users (at the bottom)
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'editor')) {
      items.push({
        key: '/users',
        icon: <UserOutlined />,
        label: 'Users',
      });
    }

    return items;
  };

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const getUserDropdownItems = () => [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: currentUser?.username || 'Profile',
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'role',
      icon: <SettingOutlined />,
      label: `Role: ${currentUser?.role || 'Unknown'}`,
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout,
    },
  ];

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: isDarkMode ? cyberBlueTheme.token.colorBgLayout : '#f0f2f5'
      }}>
        <Space direction="vertical" align="center">
          <RocketOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
          <div>Loading...</div>
        </Space>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const AppContent = () => {
    const {
      token: { colorBgContainer, colorText, colorBorder },
    } = theme.useToken();

    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Sider 
          collapsible 
          collapsed={collapsed} 
          onCollapse={setCollapsed}
          width={250}
          style={{
            background: '#000000',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 1000,
            overflow: 'auto'
          }}
        >
          <div style={{ 
            height: 64, 
            margin: 16, 
            background: 'rgba(59, 130, 246, 0.2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6',
            border: '1px solid rgba(59, 130, 246, 0.3)'
          }}>
            <RocketOutlined style={{ fontSize: '32px' }} />
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={getMenuItems()}
            onClick={handleMenuClick}
            style={{ 
              borderRight: 0,
              background: '#000000',
              color: '#ffffff'
            }}
          />
        </Sider>
        <Layout style={{ marginLeft: collapsed ? 80 : 250 }}>
          <Header
            style={{
              padding: '0 24px',
              background: colorBgContainer,
              borderBottom: `1px solid ${colorBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              zIndex: 999
            }}
          >
            <h2 style={{ margin: 0, color: colorText }}>
              {getMenuItems().find(item => item.key === location.pathname)?.label || 'Ansible Automation Platform'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SunOutlined style={{ color: isDarkMode ? '#ccc' : '#faad14' }} />
                <Switch
                  checked={isDarkMode}
                  onChange={toggleTheme}
                  size="small"
                />
                <MoonOutlined style={{ color: isDarkMode ? '#722ed1' : '#ccc' }} />
              </div>
              <Dropdown
                menu={{ items: getUserDropdownItems() }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Avatar 
                    size="small" 
                    icon={<UserOutlined />} 
                    style={{ backgroundColor: '#1890ff' }}
                  />
                  <span style={{ color: colorText }}>{currentUser?.username}</span>
                </Button>
              </Dropdown>
            </div>
          </Header>
          <Content
            style={{
              margin: 0,
              padding: 24,
              background: isDarkMode ? cyberBlueTheme.token.colorBgLayout : '#f0f2f5',
              overflow: 'auto',
              minHeight: 'calc(100vh - 64px)'
            }}
          >
            <Routes>
              <Route path="/" element={<Dashboard currentUser={currentUser} />} />
              <Route path="/dashboard" element={<Dashboard currentUser={currentUser} />} />
              <Route path="/playbooks" element={<Playbooks currentUser={currentUser} />} />
              <Route path="/hosts" element={<Hosts currentUser={currentUser} />} />
              <Route path="/credentials" element={<Credentials currentUser={currentUser} />} />
              <Route path="/variables" element={<Variables currentUser={currentUser} />} />
              <Route path="/webhooks" element={<Webhooks currentUser={currentUser} />} />
              <Route path="/users" element={<Users currentUser={currentUser} />} />
              <Route path="/editor" element={<PlaybookEditor currentUser={currentUser} />} />
              <Route path="/tasks" element={<Tasks currentUser={currentUser} />} />
              <Route path="/tasks/:taskId" element={<TaskDetail currentUser={currentUser} />} />
              <Route path="/history" element={<History currentUser={currentUser} />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    );
  };

  return (
    <ConfigProvider
      theme={isDarkMode ? cyberBlueTheme : { algorithm: theme.defaultAlgorithm }}
    >
      <AppContent />
    </ConfigProvider>
  );
}

export default App; 