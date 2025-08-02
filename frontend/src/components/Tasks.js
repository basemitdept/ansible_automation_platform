import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Button,
  Progress,
  Empty,
  message,
  Popconfirm,
  Switch,
  Tooltip
} from 'antd';
import {
  ClockCircleOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PauseCircleOutlined,
  UserOutlined,
  ApiOutlined
} from '@ant-design/icons';
import { tasksAPI } from '../services/api';
import socketService from '../services/socket';
import moment from 'moment';

const { Title } = Typography;

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const navigate = useNavigate();
  const intervalRef = useRef(null);
  const isPageVisible = useRef(true);

  useEffect(() => {
    fetchTasks();
    
    // Connect to WebSocket for real-time updates
    socketService.connect();
    
    const handleTaskUpdate = (data) => {
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === data.task_id 
            ? { ...task, status: data.status }
            : task
        )
      );
      
      // If a task is completed/failed, it will be removed on next refresh
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'partial') {
        // Trigger a refresh after a short delay to remove completed tasks
        setTimeout(() => {
          if (isPageVisible.current) {
            fetchTasks();
          }
        }, 2000);
      }
    };

    socketService.on('task_update', handleTaskUpdate);
    
    // Set up page visibility listener
    const handleVisibilityChange = () => {
      isPageVisible.current = !document.hidden;
      if (!document.hidden && autoRefresh) {
        // Page became visible, refresh immediately and restart interval
        fetchTasks();
        startAutoRefresh();
      } else if (document.hidden) {
        // Page became hidden, stop auto refresh
        stopAutoRefresh();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socketService.off('task_update', handleTaskUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopAutoRefresh();
    };
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && isPageVisible.current) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
    
    return () => stopAutoRefresh();
  }, [autoRefresh]);

  const startAutoRefresh = () => {
    stopAutoRefresh(); // Clear any existing interval
    intervalRef.current = setInterval(() => {
      if (isPageVisible.current && !loading) {
        fetchTasks();
      }
    }, 5000); // Refresh every 5 seconds
  };

  const stopAutoRefresh = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await tasksAPI.getAll();
      setTasks(response.data);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await tasksAPI.delete(id);
      message.success('Task deleted successfully');
      fetchTasks(); // Refresh the list
    } catch (error) {
      message.error('Failed to delete task');
      console.error('Delete error:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />;
      case 'running':
        return <PlayCircleOutlined style={{ color: '#1890ff' }} />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'partial':
        return <CheckCircleOutlined style={{ color: '#fa8c16' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const getStatusTag = (status) => {
    const colors = {
      pending: 'warning',
      running: 'processing',
      completed: 'success',
      partial: 'orange',
      failed: 'error'
    };
    
    return (
      <Tag color={colors[status]} icon={getStatusIcon(status)}>
        {status === 'partial' ? 'PARTIAL SUCCESS' : status.toUpperCase()}
      </Tag>
    );
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'serial_id',
      key: 'serial_id',
      render: (serial_id) => (
        <Tag color="blue" style={{ fontWeight: 'bold' }}>
          #{serial_id || 'N/A'}
        </Tag>
      ),
      width: 80,
    },
    {
      title: 'Playbook',
      dataIndex: ['playbook', 'name'],
      key: 'playbook',
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: 'Hosts',
      key: 'hosts',
      render: (text, record) => {
        const hosts = record.hosts || [record.host];
        const validHosts = hosts.filter(host => host);
        
        if (validHosts.length === 0) return 'No hosts';
        
        if (validHosts.length === 1) {
          const host = validHosts[0];
          return (
            <Space>
              <span>{host.name}</span>
              <code>({host.hostname})</code>
            </Space>
          );
        }
        
        return (
          <div>
            <div style={{ marginBottom: 4 }}>
              <Tag color="blue">{validHosts.length} hosts</Tag>
            </div>
            <div style={{ maxHeight: '60px', overflowY: 'auto' }}>
              {validHosts.map((host, index) => (
                <div key={index} style={{ fontSize: '12px', marginBottom: '2px' }}>
                  <span>{host.name}</span> <code>({host.hostname})</code>
                </div>
              ))}
            </div>
          </div>
        );
      },
      width: 200,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status),
      width: 120,
    },
    {
      title: 'User',
      key: 'user',
      render: (_, record) => {
        // Show webhook name if task was triggered by webhook
        if (record.webhook) {
          return (
            <Space>
              <ApiOutlined />
              <span style={{ color: '#1890ff' }}>
                {record.webhook.name}
              </span>
            </Space>
          );
        }
        // Show user if task was triggered by user
        return (
          <Space>
            <UserOutlined />
            {record.user?.username || 'Unknown'}
          </Space>
        );
      },
      width: 120,
    },
    {
      title: 'Started',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (date) => moment(date).format('MMM DD, HH:mm:ss'),
      width: 150,
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_, record) => {
        const start = moment(record.started_at);
        const end = record.finished_at ? moment(record.finished_at) : moment();
        const duration = moment.duration(end.diff(start));
        
        if (duration.asMinutes() < 1) {
          return `${Math.floor(duration.asSeconds())}s`;
        }
        return `${Math.floor(duration.asMinutes())}m ${Math.floor(duration.asSeconds() % 60)}s`;
      },
      width: 100,
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_, record) => {
        if (record.status === 'pending') {
          return <Progress percent={0} size="small" />;
        } else if (record.status === 'running') {
          return <Progress percent={50} size="small" status="active" />;
        } else if (record.status === 'completed') {
          return <Progress percent={100} size="small" />;
        } else if (record.status === 'failed') {
          return <Progress percent={100} size="small" status="exception" />;
        }
        return <Progress percent={0} size="small" />;
      },
      width: 120,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/tasks/${record.id}`)}
            title="View Details"
          >
            View
          </Button>
          <Popconfirm
            title="Delete this task?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
            okType="danger"
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              danger
              title="Delete"
            />
          </Popconfirm>
        </Space>
      ),
      width: 130,
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <Title level={4} style={{ margin: 0 }}>
              Running Tasks
              {loading && autoRefresh && (
                <ReloadOutlined 
                  spin 
                  style={{ 
                    marginLeft: 8, 
                    fontSize: '14px', 
                    color: '#1890ff' 
                  }} 
                />
              )}
            </Title>
          </Space>
        }
        extra={
          <Space>
            <Tooltip title={autoRefresh ? "Auto-refresh is ON (every 5s)" : "Auto-refresh is OFF"}>
              <Space>
                <Switch
                  checked={autoRefresh}
                  onChange={setAutoRefresh}
                  checkedChildren={<ReloadOutlined />}
                  unCheckedChildren={<PauseCircleOutlined />}
                  size="small"
                />
                <span style={{ 
                  fontSize: '12px', 
                  color: autoRefresh ? '#52c41a' : '#666',
                  fontWeight: autoRefresh ? 'bold' : 'normal'
                }}>
                  Auto-refresh {autoRefresh && '●'}
                </span>
              </Space>
            </Tooltip>
            {lastRefresh && (
              <Tooltip title={`Last refreshed: ${lastRefresh.toLocaleTimeString()}`}>
                <span style={{ fontSize: '11px', color: '#999' }}>
                  {moment(lastRefresh).fromNow()}
                </span>
              </Tooltip>
            )}
            <Button onClick={fetchTasks} loading={loading} icon={<ReloadOutlined />}>
              Refresh
            </Button>
          </Space>
        }
        className="card-container"
      >
        {tasks.length === 0 && !loading ? (
          <Empty
            description="No running tasks"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={tasks}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `Total ${total} tasks`,
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default Tasks; 