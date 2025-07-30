import React, { useState, useEffect } from 'react';
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
  Popconfirm
} from 'antd';
import {
  ClockCircleOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { tasksAPI } from '../services/api';
import socketService from '../services/socket';
import moment from 'moment';

const { Title } = Typography;

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
    };

    socketService.on('task_update', handleTaskUpdate);

    return () => {
      socketService.off('task_update', handleTaskUpdate);
    };
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await tasksAPI.getAll();
      setTasks(response.data);
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
            <Title level={4} style={{ margin: 0 }}>Running Tasks</Title>
          </Space>
        }
        extra={
          <Button onClick={fetchTasks} loading={loading}>
            Refresh
          </Button>
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