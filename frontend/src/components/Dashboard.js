import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Space,
  Table,
  Tag,
  Timeline,
  Alert,
  Spin,
  Divider,
  Button,
  Tooltip
} from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ApiOutlined,
  GroupOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { tasksAPI, historyAPI, hostsAPI, hostGroupsAPI, playbooksAPI, usersAPI } from '../services/api';
import moment from 'moment';

const { Title, Text } = Typography;

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [stats, setStats] = useState({
    tasks: { total: 0, running: 0, pending: 0, completed: 0, failed: 0 },
    hosts: { total: 0, linux: 0, windows: 0 },
    hostGroups: { total: 0 },
    playbooks: { total: 0 },
    users: { total: 0 },
    recentTasks: [],
    recentHistory: []
  });

  // Auto-refresh functionality
  const autoRefresh = true; // Always auto refresh in background
  const intervalRef = useRef(null);
  const isPageVisible = useRef(true);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    // Only show loading spinner for manual refresh, not auto-refresh
    if (isManualRefresh) {
      setLoading(true);
    }
    try {
      const [tasksRes, historyRes, hostsRes, groupsRes, playbooksRes, usersRes] = await Promise.all([
        tasksAPI.getAll().catch((err) => {
          console.error('Failed to fetch tasks:', err);
          return { data: [] };
        }),
        historyAPI.getAll().catch((err) => {
          console.error('Failed to fetch history:', err);
          return { data: [] };
        }),
        hostsAPI.getAll().catch((err) => {
          console.error('Failed to fetch hosts:', err);
          return { data: [] };
        }),
        hostGroupsAPI.getAll().catch((err) => {
          console.error('Failed to fetch host groups:', err);
          return { data: [] };
        }),
        playbooksAPI.getAll().catch((err) => {
          console.error('Failed to fetch playbooks:', err);
          return { data: [] };
        }),
        usersAPI.getAll().catch((err) => {
          console.error('Failed to fetch users:', err);
          return { data: [] };
        })
      ]);

      const tasks = tasksRes.data || [];
      // Handle new paginated API response format for history
      const history = historyRes.data.data || historyRes.data || [];
      const hosts = hostsRes.data || [];
      const hostGroups = groupsRes.data || [];
      const playbooks = playbooksRes.data || [];
      const users = usersRes.data || [];

      // Calculate task statistics
      // Task and history data loaded
      
      // Count active tasks (running/pending)
      const activeTasks = {
        running: tasks.filter(t => t.status === 'running').length,
        pending: tasks.filter(t => t.status === 'pending').length
      };
      
      // Count completed/failed from history (since completed tasks move to history)
      const historyStats = {
        completed: history.filter(h => 
          h.status === 'completed' || 
          h.status === 'success' || 
          h.status === 'finished' ||
          h.status === 'done'
        ).length,
        failed: history.filter(h => 
          h.status === 'failed' || 
          h.status === 'error' ||
          h.status === 'cancelled'
        ).length
      };
      
      const taskStats = {
        total: tasks.length + history.length,
        running: activeTasks.running,
        pending: activeTasks.pending,
        completed: historyStats.completed,
        failed: historyStats.failed
      };

      // Calculate host statistics
      const hostStats = {
        total: hosts.length,
        linux: hosts.filter(h => h.os_type === 'linux').length,
        windows: hosts.filter(h => h.os_type === 'windows').length
      };

      // Get recent tasks and history
      const recentTasks = tasks
        .sort((a, b) => new Date(b.started_at || b.created_at) - new Date(a.started_at || a.created_at))
        .slice(0, 10);

      const recentHistory = history
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
        .slice(0, 10);

      console.log('📊 Dashboard data fetched:', {
        tasks: tasks.length,
        history: history.length,
        hosts: hosts.length,
        hostGroups: hostGroups.length,
        playbooks: playbooks.length,
        users: users.length
      });

      setStats({
        tasks: taskStats,
        hosts: hostStats,
        hostGroups: { total: hostGroups.length },
        playbooks: { total: playbooks.length },
        users: { total: users.length },
        recentTasks,
        recentHistory
      });
      setLastRefresh(new Date());
      console.log('✅ Dashboard data updated successfully');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      // Only clear loading spinner if it was a manual refresh
      if (isManualRefresh) {
        setLoading(false);
      }
    }
  }, []); // No dependencies needed

  const handleManualRefresh = () => {
    fetchDashboardData(true); // Pass true for manual refresh to show loading
  };

  // Auto-refresh functions
  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    console.log('🔄 Dashboard auto-refresh started (every 10 seconds)');
    intervalRef.current = setInterval(() => {
      if (isPageVisible.current) {
        console.log('⏰ Dashboard auto-refresh triggered');
        fetchDashboardData();
      }
    }, 10000); // Refresh every 10 seconds for testing (was 30000)
  }, [fetchDashboardData]);

  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      console.log('⏹️ Dashboard auto-refresh stopped');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Initial data fetch and page visibility setup
  useEffect(() => {
    fetchDashboardData(true); // Initial load with loading spinner
    
    // Set up page visibility listener
    const handleVisibilityChange = () => {
      isPageVisible.current = !document.hidden;
      if (!document.hidden && autoRefresh) {
        // Page became visible, refresh immediately and restart interval
        fetchDashboardData(); // Background refresh when tab becomes visible
        startAutoRefresh();
      } else if (document.hidden) {
        // Page became hidden, stop auto refresh
        stopAutoRefresh();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopAutoRefresh();
    };
  }, [fetchDashboardData, startAutoRefresh, stopAutoRefresh]);

  // Auto-refresh effect
  useEffect(() => {
    console.log('🚀 Dashboard auto-refresh effect triggered', { autoRefresh, isPageVisible: isPageVisible.current });
    if (autoRefresh && isPageVisible.current) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
    
    return () => stopAutoRefresh();
  }, [autoRefresh, startAutoRefresh, stopAutoRefresh]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
      case 'completed':
        return 'success';
      case 'failed':
      case 'error':
        return 'error';
      case 'running':
        return 'processing';
      case 'pending':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
      case 'completed':
        return <CheckCircleOutlined />;
      case 'failed':
      case 'error':
        return <CloseCircleOutlined />;
      case 'running':
        return <PlayCircleOutlined />;
      case 'pending':
        return <ClockCircleOutlined />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const taskColumns = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)} icon={getStatusIcon(status)}>
          {status?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Playbook',
      dataIndex: ['playbook', 'name'],
      key: 'playbook',
      render: (name) => name || 'Unknown',
    },
    {
      title: 'Host',
      dataIndex: ['host', 'name'],
      key: 'host',
      render: (name, record) => {
        if (record.hosts && record.hosts.length > 1) {
          return `${record.hosts.length} hosts`;
        }
        return name || 'Unknown';
      },
    },
    {
      title: 'Started',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (date) => date ? moment(date).format('MMM DD, HH:mm') : 'Not started',
    },
  ];

  const successRate = stats.tasks.total > 0 
    ? Math.round((stats.tasks.completed / stats.tasks.total) * 100) 
    : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <Title level={2}>
              <Space>
                <DashboardOutlined />
                Dashboard
              </Space>
            </Title>
            <Text type="secondary">System overview and statistics</Text>
          </div>
          <Space>
            <Tooltip title={lastRefresh ? `Last updated: ${moment(lastRefresh).format('HH:mm:ss')}` : 'Not loaded yet'}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {lastRefresh ? `Updated ${moment(lastRefresh).fromNow()}` : 'Loading...'}
              </Text>
            </Tooltip>
            <Tooltip title="Manual refresh">
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleManualRefresh}
                loading={loading}
                size="small"
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      {/* Key Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Tasks"
              value={stats.tasks.total}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Running Tasks"
              value={stats.tasks.running}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Hosts"
              value={stats.hosts.total}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Success Rate"
              value={successRate}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: successRate > 80 ? '#52c41a' : successRate > 60 ? '#faad14' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Detailed Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="Task Statistics" extra={<PlayCircleOutlined />}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Completed"
                  value={stats.tasks.completed}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Failed"
                  value={stats.tasks.failed}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
            <Divider />
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Pending"
                  value={stats.tasks.pending}
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Running"
                  value={stats.tasks.running}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="System Resources" extra={<ApiOutlined />}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Playbooks"
                  value={stats.playbooks.total}
                  prefix={<FileTextOutlined />}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Users"
                  value={stats.users.total}
                  prefix={<UserOutlined />}
                />
              </Col>
            </Row>
            <Divider />
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Host Groups"
                  value={stats.hostGroups.total}
                  prefix={<GroupOutlined />}
                />
              </Col>
              <Col span={12}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Text strong>Host Types</Text>
                  <div>
                    <Text>🐧 Linux: {stats.hosts.linux}</Text>
                  </div>
                  <div>
                    <Text>🪟 Windows: {stats.hosts.windows}</Text>
                  </div>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>



      {/* Recent Activity */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <ClockCircleOutlined />
                Recent Tasks
              </Space>
            }
            extra={<Text type="secondary">Last 10 tasks</Text>}
          >
            {stats.recentTasks.length > 0 ? (
              <Table
                dataSource={stats.recentTasks}
                columns={taskColumns}
                pagination={false}
                size="small"
                rowKey="id"
              />
            ) : (
              <Alert message="No recent tasks" type="info" />
            )}
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <HistoryOutlined />
                Recent Activity
              </Space>
            }
            extra={<Text type="secondary">Latest executions</Text>}
          >
            {stats.recentHistory.length > 0 ? (
              <Timeline
                size="small"
                items={stats.recentHistory.slice(0, 8).map(item => ({
                  color: getStatusColor(item.status),
                  children: (
                    <div>
                      <div>
                        <Tag color={getStatusColor(item.status)} size="small">
                          {item.status}
                        </Tag>
                        <Text strong>{item.playbook?.name || 'Unknown Playbook'}</Text>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {item.host?.name || 'Unknown Host'} • {moment(item.started_at).fromNow()}
                        </Text>
                      </div>
                    </div>
                  )
                }))}
              />
            ) : (
              <Alert message="No recent activity" type="info" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;