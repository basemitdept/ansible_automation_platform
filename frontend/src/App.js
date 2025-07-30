import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, ConfigProvider, Switch } from 'antd';
import {
  BookOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  SunOutlined,
  MoonOutlined,
  KeyOutlined,
  LinkOutlined
} from '@ant-design/icons';

import Playbooks from './components/Playbooks';
import Hosts from './components/Hosts';
import PlaybookEditor from './components/PlaybookEditor';
import Tasks from './components/Tasks';
import History from './components/History';
import TaskDetail from './components/TaskDetail';
import Credentials from './components/Credentials';
import Webhooks from './components/Webhooks';
import socketService from './services/socket';

const { Header, Sider, Content } = Layout;

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Initialize from localStorage or default to false
    const savedTheme = localStorage.getItem('ansible-portal-dark-mode');
    return savedTheme ? JSON.parse(savedTheme) : false;
  });
  const navigate = useNavigate();
  const location = useLocation();

  // Save theme preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('ansible-portal-dark-mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Initialize WebSocket connection when app starts
  useEffect(() => {
    socketService.connect();
    
    return () => {
      socketService.disconnect();
    };
  }, []);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const menuItems = [
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

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

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
            items={menuItems}
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
              {menuItems.find(item => item.key === location.pathname)?.label || 'Ansible Automation Platform'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ color: colorText, fontSize: 14, opacity: 0.8 }}>
                Automate your infrastructure with confidence
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SunOutlined style={{ color: isDarkMode ? '#ccc' : '#faad14' }} />
                <Switch
                  checked={isDarkMode}
                  onChange={toggleTheme}
                  size="small"
                />
                <MoonOutlined style={{ color: isDarkMode ? '#722ed1' : '#ccc' }} />
              </div>
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
              <Route path="/" element={<Playbooks />} />
              <Route path="/playbooks" element={<Playbooks />} />
              <Route path="/hosts" element={<Hosts />} />
              <Route path="/credentials" element={<Credentials />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/editor" element={<PlaybookEditor />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/tasks/:taskId" element={<TaskDetail />} />
              <Route path="/history" element={<History />} />
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