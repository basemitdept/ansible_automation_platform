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
import Users from './components/Users';
import Login from './components/Login';
import socketService from './services/socket';
import { authAPI } from './services/api';

const { Header, Sider, Content } = Layout;

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
        background: isDarkMode ? '#141414' : '#f0f2f5'
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
            background: colorBgContainer,
          }}
        >
          <div style={{ 
            height: 32, 
            margin: 16, 
            background: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1890ff',
            fontWeight: 'bold',
            fontSize: collapsed ? 16 : 14
          }}>
            <RocketOutlined style={{ marginRight: collapsed ? 0 : 8 }} />
            {!collapsed && 'Ansible Automation'}
          </div>
          <Menu
            theme={isDarkMode ? "dark" : "light"}
            mode="inline"
            selectedKeys={[location.pathname]}
            items={getMenuItems()}
            onClick={handleMenuClick}
            style={{ borderRight: 0 }}
          />
        </Sider>
        <Layout>
          <Header
            style={{
              padding: '0 24px',
              background: colorBgContainer,
              borderBottom: `1px solid ${colorBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
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
              background: isDarkMode ? '#141414' : '#f0f2f5',
              overflow: 'auto'
            }}
          >
            <Routes>
              <Route path="/" element={<Dashboard currentUser={currentUser} />} />
              <Route path="/dashboard" element={<Dashboard currentUser={currentUser} />} />
              <Route path="/playbooks" element={<Playbooks currentUser={currentUser} />} />
              <Route path="/hosts" element={<Hosts currentUser={currentUser} />} />
              <Route path="/credentials" element={<Credentials currentUser={currentUser} />} />
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

  // Custom gray theme configuration
  const grayTheme = {
    algorithm: theme.darkAlgorithm,
    token: {
      // Primary colors
      colorPrimary: '#1890ff',
      colorInfo: '#1890ff',
      
      // Background colors - various shades of gray
      colorBgContainer: '#2f2f2f',
      colorBgElevated: '#3a3a3a',
      colorBgLayout: '#1f1f1f',
      colorBgSpotlight: '#404040',
      colorBgMask: 'rgba(0, 0, 0, 0.45)',
      
      // Border colors
      colorBorder: '#404040',
      colorBorderSecondary: '#303030',
      
      // Text colors
      colorText: '#e8e8e8',
      colorTextSecondary: '#b8b8b8',
      colorTextTertiary: '#888888',
      colorTextQuaternary: '#666666',
      
      // Component specific colors
      colorFillAlter: '#2a2a2a',
      colorFillContent: '#363636',
      colorFillContentHover: '#404040',
      colorFillSecondary: '#303030',
      
      // Control colors
      controlItemBgHover: '#404040',
      controlItemBgActive: '#1890ff',
      controlItemBgActiveHover: '#40a9ff',
      
      // Menu colors
      colorBgMenuItemSelected: '#1890ff',
      colorBgMenuItemHover: '#404040',
      colorBgMenuItemActive: '#1890ff',
    },
    components: {
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemSelectedBg: '#1890ff',
        itemHoverBg: '#404040',
        itemActiveBg: '#1890ff',
        itemSelectedColor: '#ffffff',
        itemColor: '#e8e8e8',
        iconSize: 16,
      },
      Card: {
        colorBgContainer: '#2f2f2f',
        colorBorderSecondary: '#404040',
      },
      Table: {
        colorBgContainer: '#2f2f2f',
        headerBg: '#3a3a3a',
        rowHoverBg: '#404040',
      },
      Modal: {
        colorBgElevated: '#2f2f2f',
        headerBg: '#3a3a3a',
      },
      Input: {
        colorBgContainer: '#3a3a3a',
        activeBorderColor: '#1890ff',
        hoverBorderColor: '#40a9ff',
      },
      Select: {
        colorBgContainer: '#3a3a3a',
        optionSelectedBg: '#1890ff',
        optionActiveBg: '#404040',
      },
      Button: {
        defaultBg: '#3a3a3a',
        defaultBorderColor: '#404040',
        defaultHoverBg: '#404040',
        defaultHoverBorderColor: '#40a9ff',
      }
    }
  };

  return (
    <ConfigProvider
      theme={isDarkMode ? grayTheme : { algorithm: theme.defaultAlgorithm }}
    >
      <AppContent />
    </ConfigProvider>
  );
}

export default App; 