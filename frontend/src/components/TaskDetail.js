import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Row,
  Col,
  Descriptions,
  Alert,
  Spin,
  Statistic
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { tasksAPI } from '../services/api';
import socketService from '../services/socket';
import moment from 'moment';

const { Title, Text } = Typography;

const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [output, setOutput] = useState([]);
  const outputRef = useRef(null);

  useEffect(() => {
    fetchTask();
    
    // Connect to WebSocket for real-time updates
    socketService.connect();
    
    const handleTaskUpdate = (data) => {
      if (data.task_id === taskId) {
        setTask(prevTask => ({ ...prevTask, status: data.status }));
      }
    };

    const handleTaskOutput = (data) => {
      if (data.task_id === taskId && data.output && data.output.trim()) {
        setOutput(prevOutput => {
          // Avoid duplicate lines
          const newLine = data.output.trim();
          if (prevOutput.length > 0 && prevOutput[prevOutput.length - 1] === newLine) {
            return prevOutput;
          }
          return [...prevOutput, newLine];
        });
        // Auto-scroll to bottom with requestAnimationFrame for better performance
        requestAnimationFrame(() => {
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        });
      }
    };

    socketService.on('task_update', handleTaskUpdate);
    socketService.on('task_output', handleTaskOutput);

    // Refresh task status every few seconds for tasks that are running
    // Only fetch status, not the entire output to avoid flickering
    const interval = setInterval(() => {
      if (task && (task.status === 'pending' || task.status === 'running')) {
        fetchTaskStatus();
      }
    }, 3000);

    return () => {
      socketService.off('task_update', handleTaskUpdate);
      socketService.off('task_output', handleTaskOutput);
      clearInterval(interval);
    };
  }, [taskId]);

  const fetchTask = async () => {
    setLoading(true);
    try {
      const response = await tasksAPI.getById(taskId);
      setTask(response.data);
      
      // Only set initial output if we don't have any output yet (first load)
      if (response.data.output && output.length === 0) {
        setOutput(response.data.output.split('\n').filter(line => line.trim()));
      }
    } catch (error) {
      console.error('Failed to fetch task details');
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskStatus = async () => {
    try {
      const response = await tasksAPI.getById(taskId);
      // Only update task metadata, not the output
      setTask(prevTask => ({
        ...prevTask,
        status: response.data.status,
        finished_at: response.data.finished_at,
        error_output: response.data.error_output
      }));
    } catch (error) {
      console.error('Failed to fetch task status');
    }
  };

  const parseIPStatus = () => {
    if (!output || output.length === 0) return null;

    const outputText = output.join('\n');
    const successfulIPs = new Set();
    const failedIPs = new Set();
    const allTargetIPs = new Set();

    // First, extract all target IPs from the initial execution section
    const targetMatch = outputText.match(/📋 Target IPs \((\d+)\):([\s\S]*?)={50}/);
    if (targetMatch) {
      const targetSection = targetMatch[2];
      const targetLines = targetSection.split('\n').filter(line => line.includes('🖥️  IP'));
      targetLines.forEach(line => {
        const ipMatch = line.match(/🖥️  IP (\S+)/);
        if (ipMatch) {
          allTargetIPs.add(ipMatch[1]);
        }
      });
    }

    // Look for the quick IP reference section (most reliable)
    const quickRefMatch = outputText.match(/📋 QUICK IP REFERENCE:\n([\s\S]*?)(?=={60}|$)/);
    if (quickRefMatch) {
      const refSection = quickRefMatch[1];
      
      // Extract successful IPs
      const successMatch = refSection.match(/✅ Success: (.+)/);
      if (successMatch) {
        const ips = successMatch[1].split(',').map(ip => ip.trim()).filter(ip => ip);
        ips.forEach(ip => successfulIPs.add(ip));
      }
      
      // Extract failed IPs
      const failedMatch = refSection.match(/❌ Failed: (.+)/);
      if (failedMatch) {
        const ips = failedMatch[1].split(',').map(ip => ip.trim()).filter(ip => ip);
        ips.forEach(ip => failedIPs.add(ip));
      }
    }
    
    // Also look for individual final status messages as backup
    output.forEach(line => {
      if (line.includes('✅ IP') && line.includes('FINAL STATUS = SUCCESS')) {
        const ipMatch = line.match(/✅ IP (\S+)/);
        if (ipMatch) {
          successfulIPs.add(ipMatch[1]);
        }
      } else if (line.includes('❌ IP') && line.includes('FINAL STATUS = FAILED')) {
        const ipMatch = line.match(/❌ IP (\S+)/);
        if (ipMatch) {
          failedIPs.add(ipMatch[1]);
        }
      }
    });

    // If we have any IP information, return it
    const totalFound = successfulIPs.size + failedIPs.size;
    const totalTarget = allTargetIPs.size;
    
    if (totalFound > 0 || totalTarget > 0) {
      return {
        successfulIPs: Array.from(successfulIPs),
        failedIPs: Array.from(failedIPs),
        totalIPs: Math.max(totalFound, totalTarget),
        isComplete: totalFound === totalTarget && totalTarget > 0
      };
    }

    return null;
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
      <Tag color={colors[status]} icon={getStatusIcon(status)} style={{ fontSize: 14 }}>
        {status === 'partial' ? 'PARTIAL SUCCESS' : status.toUpperCase()}
      </Tag>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!task) {
    return (
      <Alert
        message="Task Not Found"
        description="The requested task could not be found."
        type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/tasks')}
            >
              Back to Tasks
            </Button>
            <Title level={4} style={{ margin: 0 }}>Task Details</Title>
          </Space>
        }
        extra={
          <Space>
            {getStatusTag(task.status)}
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchTask}
              title="Refresh"
            />
          </Space>
        }
        className="card-container"
      >
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Playbook">
                <strong>{task.playbook?.name}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Host">
                {task.host?.name} ({task.host?.hostname})
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                {getStatusTag(task.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Started">
                {moment(task.started_at).format('MMM DD, YYYY HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {(() => {
                  const start = moment(task.started_at);
                  const end = task.finished_at ? moment(task.finished_at) : moment();
                  const duration = moment.duration(end.diff(start));
                  
                  if (duration.asMinutes() < 1) {
                    return `${Math.floor(duration.asSeconds())} seconds`;
                  }
                  return `${Math.floor(duration.asMinutes())} minutes ${Math.floor(duration.asSeconds() % 60)} seconds`;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Finished">
                {task.finished_at ? moment(task.finished_at).format('MMM DD, YYYY HH:mm:ss') : 'Still running...'}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>

        {/* IP Status Cards - Separate from console output */}
        {(() => {
          const ipStatus = parseIPStatus();
          if (ipStatus && ipStatus.totalIPs > 0) {
            return (
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <Statistic
                      title="Total IPs Targeted"
                      value={ipStatus.totalIPs}
                      prefix="🖥️"
                      valueStyle={{ fontSize: '24px', fontWeight: 'bold' }}
                    />
                    {!ipStatus.isComplete && task?.status === 'running' && (
                      <Tag color="processing" style={{ marginTop: 8 }}>
                        Execution in Progress...
                      </Tag>
                    )}
                    {ipStatus.isComplete && (
                      <Tag color="success" style={{ marginTop: 8 }}>
                        Execution Complete
                      </Tag>
                    )}
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', borderColor: '#52c41a' }}>
                    <Statistic
                      title="Successful IPs"
                      value={ipStatus.successfulIPs.length}
                      prefix="✅"
                      valueStyle={{ color: '#52c41a', fontSize: '24px', fontWeight: 'bold' }}
                    />
                    {ipStatus.successfulIPs.length > 0 && (
                      <div style={{ marginTop: 8, textAlign: 'left' }}>
                        {ipStatus.successfulIPs.map((ip, index) => (
                          <Tag key={index} color="success" style={{ marginBottom: 4 }}>
                            {ip}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', borderColor: '#ff4d4f' }}>
                    <Statistic
                      title="Failed IPs"
                      value={ipStatus.failedIPs.length}
                      prefix="❌"
                      valueStyle={{ color: '#ff4d4f', fontSize: '24px', fontWeight: 'bold' }}
                    />
                    {ipStatus.failedIPs.length > 0 && (
                      <div style={{ marginTop: 8, textAlign: 'left' }}>
                        {ipStatus.failedIPs.map((ip, index) => (
                          <Tag key={index} color="error" style={{ marginBottom: 4 }}>
                            {ip}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </Card>
                </Col>
              </Row>
            );
          }
          return null;
        })()}

        {task.playbook?.description && (
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Alert
                message="Playbook Description"
                description={task.playbook.description}
                type="info"
                showIcon
              />
            </Col>
          </Row>
        )}

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title={
                <Space>
                  <Text strong>Live Output</Text>
                  {task.status === 'running' && (
                    <Tag color="processing">Live</Tag>
                  )}
                </Space>
              }
              size="small"
            >
              <div
                ref={outputRef}
                className="task-output"
                style={{
                  height: '400px',
                  overflow: 'auto',
                  backgroundColor: '#1f1f1f',
                  color: '#fff',
                  padding: '16px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '1.4'
                }}
              >
                {output.length === 0 ? (
                  <div style={{ color: '#666', fontStyle: 'italic' }}>
                    {task.status === 'pending' ? 'Waiting for execution to start...' : 'No output yet...'}
                  </div>
                ) : (
                  output.map((line, index) => (
                    <div key={index} className="output-line">
                      {line}
                    </div>
                  ))
                )}
                
                {task.status === 'running' && (
                  <div style={{ color: '#1890ff', marginTop: '8px' }}>
                    <span>●</span> Execution in progress...
                  </div>
                )}
              </div>
            </Card>
          </Col>
        </Row>

        {task.error_output && (
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card
                title={<Text strong style={{ color: '#ff4d4f' }}>Error Output</Text>}
                size="small"
              >
                <div
                  style={{
                    backgroundColor: '#2d1b1b',
                    color: '#ff7875',
                    padding: '16px',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {task.error_output}
                </div>
              </Card>
            </Col>
          </Row>
        )}
      </Card>
    </div>
  );
};

export default TaskDetail; 