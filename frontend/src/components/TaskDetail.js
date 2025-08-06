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
  Statistic,
  message,
  notification
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  HistoryOutlined
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
  const [redirecting, setRedirecting] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const outputRef = useRef(null);
  const redirectTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    console.log('🔴 TASKDETAIL: useEffect triggered for task:', taskId);
    
    fetchTask();
    
    // Connect to WebSocket for real-time updates
    console.log('TaskDetail: Connecting to WebSocket for task:', taskId);
    socketService.connect();
    
    // Monitor WebSocket connection status
    const checkWebSocketConnection = () => {
      const isConnected = socketService.socket?.connected || false;
      console.log('TaskDetail: WebSocket connected:', isConnected);
      setWsConnected(isConnected);
    };
    
    // Check connection status immediately and periodically
    checkWebSocketConnection();
    const wsCheckInterval = setInterval(checkWebSocketConnection, 2000);
    
    const handleTaskUpdate = (data) => {
      if (data.task_id === taskId) {
        console.log('TaskDetail: Received WebSocket task update:', data);
        setTask(prevTask => {
          console.log('TaskDetail: Previous task status:', prevTask?.status, 'New status:', data.status);
          const newTask = { ...prevTask, status: data.status };
          
          // Check if task just completed and trigger redirect
          if (prevTask && prevTask.status !== data.status && 
              (data.status === 'completed' || data.status === 'failed' || data.status === 'partial')) {
            console.log('TaskDetail: WebSocket - Task completed, triggering redirect for status:', data.status);
            // Add a small delay to ensure user can see the completion
            setTimeout(() => {
              handleTaskCompletion(data.status);
            }, 1000);
          }
          
          return newTask;
        });
      } else {
        console.log('TaskDetail: Ignoring WebSocket update for different task:', data.task_id, 'vs', taskId);
      }
    };

    const handleTaskOutput = (data) => {
      console.log('🔴 FRONTEND: Received task_output:', data);
      console.log('🔴 FRONTEND: Current taskId:', taskId);
      console.log('🔴 FRONTEND: Message task_id:', data.task_id);
      console.log('🔴 FRONTEND: IDs match:', data.task_id === taskId);
      
      // Show ALL messages regardless of task ID + show empty lines too
      const displayText = (data.output !== undefined) ? (data.output.trim() || '[EMPTY]') : '[UNDEFINED]';
      console.log('🔴 FRONTEND DEBUG: Adding ANY task output:', displayText);
      console.log('🔴 FRONTEND DEBUG: Current output length before add:', output.length);
      
      setOutput(prevOutput => {
        const newOutput = [...prevOutput, `[${data.task_id.substr(0,8)}] ${displayText}`];
        console.log('🔴 FRONTEND DEBUG: New output length after add:', newOutput.length);
        // Keep only last 200 lines to prevent memory issues
        return newOutput.slice(-200);
      });
        
      // Force scroll to bottom
      setTimeout(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      }, 10);
    };

    console.log('🔴 FRONTEND: Setting up WebSocket listeners for task:', taskId);
    console.log('🔴 FRONTEND: socketService object:', socketService);
    console.log('🔴 FRONTEND: socketService.on function:', socketService.on);
    
    socketService.on('task_update', handleTaskUpdate);
    socketService.on('task_output', handleTaskOutput);
    
    console.log('🔴 FRONTEND: WebSocket listeners setup complete');
    console.log('🔴 FRONTEND: Registered listeners:', socketService.listeners);
    
    // Test if listeners are working by manually emitting a test
    setTimeout(() => {
      console.log('🔴 FRONTEND: Testing listener setup...');
      if (socketService.listeners && socketService.listeners.has('task_output')) {
        console.log('🔴 FRONTEND: task_output listeners count:', socketService.listeners.get('task_output').length);
      }
    }, 1000);

    // DISABLED: Aggressive polling was clearing live output too quickly
    // Let WebSocket handle status updates instead
    console.log('🔴 TASKDETAIL: Aggressive polling DISABLED to allow live output viewing');
    const completionCheckInterval = null;
    
    // Slower polling for task completion - check every 10 seconds only
    const slowCompletionCheckInterval = setInterval(async () => {
      if (!redirecting) {
        try {
          console.log('TaskDetail: Slow polling check...');
          const response = await tasksAPI.getById(taskId);
          const currentStatus = response.data.status;
          
          console.log('TaskDetail: Polled status:', currentStatus, 'Current task status:', task?.status);
          
          // Check if task completed and trigger redirect if not already redirecting
          if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'partial') {
            console.log('TaskDetail: Task completed via polling, current status:', currentStatus);
            setTask(prevTask => {
              const updatedTask = {
                ...prevTask,
                status: currentStatus,
                finished_at: response.data.finished_at,
                error_output: response.data.error_output
              };
              
              // Trigger redirect if status changed to completed
              if (prevTask && prevTask.status !== currentStatus) {
                console.log('TaskDetail: Status changed from', prevTask.status, 'to', currentStatus, '- triggering redirect');
                handleTaskCompletion(currentStatus);
              }
              
              return updatedTask;
            });
          }
        } catch (error) {
          console.error('TaskDetail: Error in slow polling:', error);
        }
      }
    }, 10000); // Check every 10 seconds only

    return () => {
      socketService.off('task_update', handleTaskUpdate);
      socketService.off('task_output', handleTaskOutput);
      if (completionCheckInterval) clearInterval(completionCheckInterval);
      clearInterval(slowCompletionCheckInterval);
      clearInterval(wsCheckInterval);
      clearTimeout(redirectTimeoutRef.current);
      clearInterval(countdownIntervalRef.current);
    };
  }, [taskId]); // Remove redirecting dependency to prevent cleanup

  const fetchTask = async () => {
    setLoading(true);
    try {
      const response = await tasksAPI.getById(taskId);
      setTask(response.data);
      
      // DISABLED: Don't load static output - use live WebSocket output only
      console.log('🔴 TASKDETAIL: Skipping static output load, using live WebSocket only');
      // if (response.data.output && output.length === 0) {
      //   setOutput(response.data.output.split('\n').filter(line => line.trim()));
      // }
      
      // Check if task is already completed on first load
      if (response.data.status === 'completed' || 
          response.data.status === 'failed' || 
          response.data.status === 'partial') {
        console.log('TaskDetail: Task is already completed on load, status:', response.data.status);
        // Trigger immediately for already completed tasks
        handleTaskCompletion(response.data.status);
      }
    } catch (error) {
      console.error('Failed to fetch task details');
    } finally {
      setLoading(false);
    }
  };

  // Removed old fetchTaskStatus - using aggressive polling instead

  const handleTaskCompletion = (status) => {
    console.log('TaskDetail: handleTaskCompletion called with status:', status);
    
    // Prevent duplicate redirects
    if (redirecting) {
      console.log('TaskDetail: Already redirecting, ignoring duplicate completion');
      return;
    }
    
    // Clear any existing timers
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Show completion notification
    const statusText = status === 'completed' ? 'completed successfully' : 
                      status === 'partial' ? 'completed with partial success' : 'failed';
    
    console.log('TaskDetail: Showing notification and starting redirect countdown');
    
    notification.success({
      message: 'Task Execution Finished',
      description: `Task ${statusText}. Redirecting to History page...`,
      icon: <HistoryOutlined style={{ color: '#52c41a' }} />,
      duration: 5,
    });

    // Start redirect countdown - shorter for better UX
    setRedirecting(true);
    setRedirectCountdown(3);
    
    // Create a more robust redirect mechanism
    let countdown = 3;
    
    // Update countdown every second
    countdownIntervalRef.current = setInterval(() => {
      countdown--;
      console.log('TaskDetail: Countdown:', countdown);
      setRedirectCountdown(countdown);
      
      if (countdown <= 0) {
        console.log('TaskDetail: Countdown reached 0, redirecting now!');
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        
        // Direct redirect with multiple fallbacks
        try {
          console.log('TaskDetail: Executing navigation to /history');
          navigate('/history');
          console.log('TaskDetail: Navigation completed successfully');
        } catch (error) {
          console.error('TaskDetail: Navigation error:', error);
          // Fallback 1: try window.location with hash
          try {
            window.location.hash = '#/history';
            setTimeout(() => window.location.reload(), 100);
          } catch (hashError) {
            console.error('TaskDetail: Hash navigation failed:', hashError);
            // Fallback 2: full page reload to history
            window.location.href = window.location.origin + '/#/history';
          }
        }
      }
    }, 1000);
  };

  const cancelRedirect = () => {
    console.log('TaskDetail: Cancelling redirect');
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRedirecting(false);
    setRedirectCountdown(0);
    message.info('Auto-redirect cancelled');
  };

  // Removed old checkTaskCompletion - using aggressive polling instead

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
            <Title level={4} style={{ margin: 0 }}>
              Task Details
              {task?.status === 'running' && (
                <Tag color="processing" style={{ marginLeft: 8 }}>
                  Monitoring for completion...
                </Tag>
              )}
              {task?.status === 'running' && (
                <Tag color={wsConnected ? "success" : "error"} style={{ marginLeft: 4 }}>
                  WS: {wsConnected ? "Connected" : "Disconnected"}
                </Tag>
              )}
            </Title>
          </Space>
        }
        extra={
          <Space>
            {getStatusTag(task.status)}
            {(task.status === 'completed' || task.status === 'failed' || task.status === 'partial') && (
              <Button
                type="primary"
                icon={<HistoryOutlined />}
                onClick={() => navigate('/history')}
                title="View in History"
              >
                View in History
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchTask}
              title="Refresh"
            />
          </Space>
        }
        className="card-container"
      >
        {/* Debug Info */}
        {(task?.status === 'completed' || task?.status === 'failed' || task?.status === 'partial') && !redirecting && (
          <Alert
            message="Task Completed - Auto Redirect Not Working?"
            description={
              <Space>
                <span>Task status: {task?.status}. Auto-redirect should have triggered.</span>
                <Button 
                  size="small" 
                  type="primary"
                  onClick={() => handleTaskCompletion(task.status)}
                >
                  Trigger Redirect Manually
                </Button>
                <Button 
                  size="small" 
                  onClick={() => navigate('/history')}
                >
                  Go to History
                </Button>
              </Space>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Redirect Alert */}
        {redirecting && (
          <Alert
            message="Task Completed - Auto Redirect"
            description={
              <Space>
                <span>Redirecting to History page in {redirectCountdown} seconds...</span>
                <Button 
                  size="small" 
                  onClick={cancelRedirect}
                  type="link"
                >
                  Cancel
                </Button>
                <Button 
                  size="small" 
                  type="primary"
                  onClick={() => navigate('/history')}
                >
                  Go Now
                </Button>
              </Space>
            }
            type="success"
            showIcon
            icon={<HistoryOutlined />}
            style={{ marginBottom: 16 }}
            closable
            onClose={cancelRedirect}
          />
        )}

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
                {task.started_at && moment(task.started_at).isValid() 
                  ? moment(task.started_at).format('MMM DD, YYYY HH:mm:ss')
                  : 'Not available'
                }
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
                {task.finished_at 
                  ? moment(task.finished_at).isValid()
                    ? moment(task.finished_at).format('MMM DD, YYYY HH:mm:ss')
                    : 'Invalid date'
                  : 'Still running...'
                }
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