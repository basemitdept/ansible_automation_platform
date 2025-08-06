import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Button,
  Modal,
  Input,
  message,
  Popconfirm,
  Alert,
  Row,
  Col,
  Statistic,
  Tabs,
  Collapse,
  Badge,
  List,
  Avatar,
  Switch,
  Tooltip
} from 'antd';
import {
  HistoryOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  UserOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  PauseCircleOutlined,
  RedoOutlined,
  ApiOutlined
} from '@ant-design/icons';
import { historyAPI, artifactsAPI, tasksAPI, credentialsAPI } from '../services/api';
import moment from 'moment';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;
const { Panel } = Collapse;

const History = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [outputModalVisible, setOutputModalVisible] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const autoRefresh = true; // Always auto refresh in background
  const [lastRefresh, setLastRefresh] = useState(null);
  const intervalRef = useRef(null);
  const isPageVisible = useRef(true);
  
  // Rerun functionality state
  const [rerunModalVisible, setRerunModalVisible] = useState(false);
  const [selectedRerunExecution, setSelectedRerunExecution] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [rerunning, setRerunning] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchHistory(true); // Initial load with loading spinner
    
    // Set up page visibility listener
    const handleVisibilityChange = () => {
      isPageVisible.current = !document.hidden;
      if (!document.hidden && autoRefresh) {
        // Page became visible, refresh immediately and restart interval
        fetchHistory(); // Background refresh when tab becomes visible
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
        fetchHistory(); // Background auto-refresh, no loading spinner
      }
    }, 10000); // Refresh every 10 seconds for history
  };

  const stopAutoRefresh = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const fetchHistory = async (isManualRefresh = false) => {
    // Only show loading spinner for manual refresh, not auto-refresh
    if (isManualRefresh) {
      setLoading(true);
    }
    try {
      const response = await historyAPI.getAll();
      // Sort by newest first (started_at or created_at descending)
      const sortedHistory = response.data.sort((a, b) => {
        const dateA = new Date(a.started_at || a.created_at);
        const dateB = new Date(b.started_at || b.created_at);
        return dateB - dateA;
      });
      setHistory(sortedHistory);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch execution history');
    } finally {
      // Only clear loading spinner if it was a manual refresh
      if (isManualRefresh) {
        setLoading(false);
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <PlayCircleOutlined style={{ color: '#1890ff' }} />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'partial':
        return <CheckCircleOutlined style={{ color: '#fa8c16' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <PlayCircleOutlined />;
    }
  };

  const getStatusTag = (status) => {
    const colors = {
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

  const showOutput = async (execution) => {
    setSelectedExecution(execution);
    setOutputModalVisible(true);
    
    // Fetch artifacts for this execution
    setArtifactsLoading(true);
    try {
      const response = await artifactsAPI.getByExecution(execution.id);
      setArtifacts(response.data);
    } catch (error) {
      console.error('Failed to fetch artifacts');
      setArtifacts([]);
    } finally {
      setArtifactsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await historyAPI.delete(id);
      message.success('Execution history deleted successfully');
      fetchHistory(true); // Manual refresh after delete with loading spinner
    } catch (error) {
      message.error('Failed to delete execution history');
      console.error('Delete error:', error);
    }
  };

  const handleRerun = async (execution) => {
    setSelectedRerunExecution(execution);
    
    // Fetch credentials for authentication options
    try {
      const response = await credentialsAPI.getAll();
      setCredentials(response.data);
    } catch (error) {
      console.error('Failed to fetch credentials');
      setCredentials([]);
    }
    
    setRerunModalVisible(true);
  };

  const executeRerun = async (authData) => {
    if (!selectedRerunExecution) return;
    
    setRerunning(true);
    try {
      // Get host IDs from the execution history
      const hostIds = selectedRerunExecution.hosts ? 
        selectedRerunExecution.hosts.map(host => host.id) : 
        (selectedRerunExecution.host ? [selectedRerunExecution.host.id] : []);
      
      const executeData = {
        playbook_id: selectedRerunExecution.playbook_id,
        host_ids: hostIds,
        ...authData
      };

      const response = await tasksAPI.execute(executeData);
      
      const hostCount = hostIds.length;
      const targetInfo = hostCount > 0 ? `${hostCount} host(s)` : 'dynamic targets';
      message.success(`Playbook rerun started on ${targetInfo}`);
      
      setRerunModalVisible(false);
      
      // Navigate to the task detail page
      if (response.data.task && response.data.task.id) {
        navigate(`/tasks/${response.data.task.id}`);
      }
      
    } catch (error) {
      message.error('Failed to rerun playbook');
      console.error('Rerun error:', error);
    } finally {
      setRerunning(false);
    }
  };

  const handleRerunWithCredential = async () => {
    if (!selectedCredential) {
      message.warning('Please select a credential');
      return;
    }

    try {
      const credResponse = await credentialsAPI.getPassword(selectedCredential);
      const credential = credentials.find(c => c.id === selectedCredential);
      
      await executeRerun({
        username: credential.username,
        password: credResponse.data.password
      });
    } catch (error) {
      message.error('Failed to get credential password');
      console.error('Credential error:', error);
    }
  };

  const handleRerunWithoutCredentials = async () => {
    await executeRerun({});
  };

  const parseExecutionSummary = (output) => {
    if (!output) return null;

    const successfulHosts = [];
    const failedHosts = [];
    let totalHosts = 0;

    // Look for the final execution summary section
    const summaryMatch = output.match(/🏁 FINAL EXECUTION SUMMARY[\s\S]*?={60}/);
    if (summaryMatch) {
      const summarySection = summaryMatch[0];
      
      // Extract successful hosts
      const successMatch = summarySection.match(/✅ SUCCESSFUL HOSTS \((\d+)\):([\s\S]*?)(?=❌|={60})/);
      if (successMatch) {
        const successLines = successMatch[2].split('\n').filter(line => line.includes('🟢'));
        successLines.forEach(line => {
          const hostMatch = line.match(/🟢\s+(.+?)\s+\((.+?)\)/);
          if (hostMatch) {
            successfulHosts.push({
              name: hostMatch[1].trim(),
              ip: hostMatch[2].trim()
            });
          }
        });
      }

      // Extract failed hosts
      const failedMatch = summarySection.match(/❌ FAILED HOSTS \((\d+)\):([\s\S]*?)(?=={60})/);
      if (failedMatch) {
        const failedLines = failedMatch[2].split('\n').filter(line => line.includes('🔴'));
        failedLines.forEach(line => {
          const hostMatch = line.match(/🔴\s+(.+?)\s+\((.+?)\)/);
          if (hostMatch) {
            failedHosts.push({
              name: hostMatch[1].trim(),
              ip: hostMatch[2].trim()
            });
          }
        });
      }

      // Extract total from results line
      const resultsMatch = summarySection.match(/📈 Results: (\d+)\/(\d+) hosts successful/);
      if (resultsMatch) {
        totalHosts = parseInt(resultsMatch[2]);
      }
    }

    // Fallback: Look for individual status messages if summary not found
    if (successfulHosts.length === 0 && failedHosts.length === 0) {
      const lines = output.split('\n');
      lines.forEach(line => {
        // Look for success indicators
        if (line.includes('✅') && line.includes('FINAL STATUS = SUCCESS')) {
          const hostMatch = line.match(/✅\s+(.+?)\s+\((.+?)\):/);
          if (hostMatch && !successfulHosts.find(h => h.ip === hostMatch[2].trim())) {
            successfulHosts.push({
              name: hostMatch[1].trim(),
              ip: hostMatch[2].trim()
            });
          }
        }
        // Look for failure indicators
        else if (line.includes('❌') && line.includes('FINAL STATUS = FAILED')) {
          const hostMatch = line.match(/❌\s+(.+?)\s+\((.+?)\):/);
          if (hostMatch && !failedHosts.find(h => h.ip === hostMatch[2].trim())) {
            failedHosts.push({
              name: hostMatch[1].trim(),
              ip: hostMatch[2].trim()
            });
          }
        }
      });
    }

    if (successfulHosts.length > 0 || failedHosts.length > 0) {
      return {
        successfulHosts,
        failedHosts,
        totalHosts: totalHosts || (successfulHosts.length + failedHosts.length)
      };
    }

    return null;
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
      filters: [
        { text: 'Completed', value: 'completed' },
        { text: 'Partial Success', value: 'partial' },
        { text: 'Failed', value: 'failed' },
        { text: 'Running', value: 'running' },
      ],
      onFilter: (value, record) => record.status === value,
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
      render: (date) => {
        if (!date) return '-';
        const momentDate = moment(date);
        return momentDate.isValid() ? momentDate.format('MMM DD, YYYY HH:mm:ss') : '-';
      },
      width: 180,
      sorter: (a, b) => moment(a.started_at).unix() - moment(b.started_at).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_, record) => {
        if (!record.finished_at) {
          return 'Still running...';
        }
        
        const start = moment(record.started_at);
        const end = moment(record.finished_at);
        const duration = moment.duration(end.diff(start));
        
        if (duration.asMinutes() < 1) {
          return `${Math.floor(duration.asSeconds())}s`;
        }
        return `${Math.floor(duration.asMinutes())}m ${Math.floor(duration.asSeconds() % 60)}s`;
      },
      width: 100,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<RedoOutlined />}
            onClick={() => handleRerun(record)}
            title="Rerun this task"
          >
            Rerun
          </Button>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => showOutput(record)}
            title="View Output"
          >
            Output
          </Button>
          <Popconfirm
            title="Delete this execution history?"
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
      width: 200,
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <HistoryOutlined />
            <Title level={4} style={{ margin: 0 }}>Execution History</Title>
          </Space>
        }
        extra={
          <Button onClick={() => fetchHistory(true)} loading={loading} icon={<ReloadOutlined />}>
            Refresh
          </Button>
        }
        className="card-container"
      >
        <Table
          columns={columns}
          dataSource={history}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} executions`,
          }}
        />
      </Card>

      {/* Output Modal */}
      <Modal
        title={
          <Space>
            <EyeOutlined />
            Execution Output - {selectedExecution?.playbook?.name}
          </Space>
        }
        open={outputModalVisible}
        onCancel={() => setOutputModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setOutputModalVisible(false)}>
            Close
          </Button>
        ]}
      >
        {selectedExecution && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>Host:</Text> {selectedExecution.host?.name} ({selectedExecution.host?.hostname})
                </div>
                <div>
                  <Text strong>Status:</Text> {getStatusTag(selectedExecution.status)}
                </div>
                <div>
                  <Text strong>User:</Text> {
                    selectedExecution.webhook ? (
                      <span style={{ color: '#1890ff' }}>
                        <ApiOutlined style={{ marginRight: 4 }} />
                        {selectedExecution.webhook.name}
                      </span>
                    ) : (
                      <span>
                        <UserOutlined style={{ marginRight: 4 }} />
                        {selectedExecution.user?.username || 'Unknown'}
                      </span>
                    )
                  }
                </div>
                <div>
                  <Text strong>Started:</Text> {
                    selectedExecution.started_at 
                      ? moment(selectedExecution.started_at).isValid() 
                        ? moment(selectedExecution.started_at).format('MMM DD, YYYY HH:mm:ss')
                        : 'Invalid date'
                      : 'Not available'
                  }
                </div>
                {selectedExecution.finished_at && (
                  <div>
                    <Text strong>Finished:</Text> {
                      moment(selectedExecution.finished_at).isValid()
                        ? moment(selectedExecution.finished_at).format('MMM DD, YYYY HH:mm:ss')
                        : 'Invalid date'
                    }
                  </div>
                )}
              </Space>
            </div>

            {/* Execution Summary */}
            {(() => {
              const summary = parseExecutionSummary(selectedExecution.output);
              if (summary) {
                return (
                  <div style={{ marginBottom: 16 }}>
                    <Alert
                      message="Execution Summary"
                      description={
                        <div>
                          <Row gutter={16} style={{ marginBottom: 12 }}>
                            <Col span={8}>
                              <Statistic
                                title="Total Hosts"
                                value={summary.totalHosts}
                                prefix="🖥️"
                              />
                            </Col>
                            <Col span={8}>
                              <Statistic
                                title="Successful"
                                value={summary.successfulHosts.length}
                                prefix="✅"
                                valueStyle={{ color: '#52c41a' }}
                              />
                            </Col>
                            <Col span={8}>
                              <Statistic
                                title="Failed"
                                value={summary.failedHosts.length}
                                prefix="❌"
                                valueStyle={{ color: '#ff4d4f' }}
                              />
                            </Col>
                          </Row>
                          
                          {summary.successfulHosts.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <Text strong style={{ color: '#52c41a' }}>✅ Successful IPs:</Text>
                              <div style={{ marginLeft: 16, marginTop: 4 }}>
                                {summary.successfulHosts.map((host, index) => (
                                  <Tag key={index} color="success" style={{ marginBottom: 4 }}>
                                    {host.name} ({host.ip})
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {summary.failedHosts.length > 0 && (
                            <div>
                              <Text strong style={{ color: '#ff4d4f' }}>❌ Failed IPs:</Text>
                              <div style={{ marginLeft: 16, marginTop: 4 }}>
                                {summary.failedHosts.map((host, index) => (
                                  <Tag key={index} color="error" style={{ marginBottom: 4 }}>
                                    {host.name} ({host.ip})
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      }
                      type="info"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  </div>
                );
              }
              return null;
            })()}

            <Tabs defaultActiveKey="output">
              <TabPane tab="Console Output" key="output">
                {selectedExecution.output && (
                  <div
                    style={{
                      backgroundColor: '#1f1f1f',
                      color: '#fff',
                      padding: '16px',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      maxHeight: '400px',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {selectedExecution.output}
                  </div>
                )}
                
                {selectedExecution.error_output && (
                  <div style={{ marginTop: 16 }}>
                    <Text strong style={{ color: '#ff4d4f' }}>Error Output:</Text>
                    <div
                      style={{
                        backgroundColor: '#2d1b1b',
                        color: '#ff7875',
                        padding: '16px',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        maxHeight: '200px',
                        overflow: 'auto',
                        marginTop: '8px',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {selectedExecution.error_output}
                    </div>
                  </div>
                )}
              </TabPane>
              
              <TabPane 
                tab={
                  <span>
                    Register Artifacts 
                    <Badge count={artifacts.length} style={{ marginLeft: 8 }} />
                  </span>
                } 
                key="artifacts"
              >
                {artifactsLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    Loading register variables...
                  </div>
                ) : artifacts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    No register variables found for this execution
                  </div>
                ) : (
                  <Collapse>
                    {artifacts.map((artifact) => (
                      <Collapse.Panel
                        header={
                          <div>
                            <Tag color="blue">{artifact.host_name}</Tag>
                            <span style={{ fontWeight: 'bold' }}>{artifact.task_name}</span>
                            <Tag 
                              color={
                                artifact.task_status === 'failed' ? 'red' :
                                artifact.task_status === 'fatal' ? 'red' :
                                artifact.task_status === 'changed' ? 'orange' :
                                artifact.task_status === 'unreachable' ? 'volcano' :
                                artifact.task_status === 'skipped' ? 'default' :
                                'green'
                              } 
                              style={{ marginLeft: 8 }}
                            >
                              {artifact.task_status === 'ok' ? 'SUCCESS' :
                               artifact.task_status === 'changed' ? 'CHANGED' :
                               artifact.task_status === 'failed' ? 'FAILED' :
                               artifact.task_status === 'fatal' ? 'FATAL' :
                               artifact.task_status === 'unreachable' ? 'UNREACHABLE' :
                               artifact.task_status === 'skipped' ? 'SKIPPED' :
                               artifact.task_status?.toUpperCase() || 'UNKNOWN'}
                            </Tag>
                          </div>
                        }
                        key={artifact.id}
                      >
                        <div>
                          <Text strong>Register Variable: </Text>
                          <code>{artifact.register_name}</code>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          {/* Enhanced message display */}
                          {(() => {
                            try {
                              const data = typeof artifact.register_data === 'string' 
                                ? JSON.parse(artifact.register_data) 
                                : artifact.register_data;
                              
                              const msg = data?.msg;
                              const stdout = data?.stdout;
                              const stderr = data?.stderr;
                              const changed = data?.changed;
                              const failed = data?.failed;
                              const rc = data?.rc;
                              
                              return (
                                <div>
                                  {/* Primary message */}
                                  {msg && (
                                    <div style={{ marginBottom: 12 }}>
                                      <Text strong>Message:</Text>
                                      <div style={{
                                        backgroundColor: failed ? '#fff2f0' : changed ? '#fff7e6' : '#f6ffed',
                                        border: failed ? '1px solid #ffccc7' : changed ? '1px solid #ffd591' : '1px solid #b7eb8f',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        marginTop: '4px',
                                        fontFamily: 'inherit',
                                        lineHeight: '1.6',
                                        fontSize: '14px'
                                      }}>
                                        <span style={{ 
                                          color: failed ? '#cf1322' : changed ? '#d46b08' : '#389e0d',
                                          fontWeight: '500',
                                          display: 'block',
                                          wordBreak: 'break-word'
                                        }}>
                                          {msg}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Standard output */}
                                  {stdout && stdout !== msg && (
                                    <div style={{ marginBottom: 12 }}>
                                      <Text strong>Output:</Text>
                                      <pre style={{
                                        backgroundColor: '#f6f8fa',
                                        color: '#24292e',
                                        border: '1px solid #e1e4e8',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        marginTop: '4px',
                                        fontSize: '13px',
                                        fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
                                        maxHeight: '200px',
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: '1.45'
                                      }}>
                                        {stdout}
                                      </pre>
                                    </div>
                                  )}
                                  
                                  {/* Error output */}
                                  {stderr && (
                                    <div style={{ marginBottom: 12 }}>
                                      <Text strong style={{ color: '#cf1322' }}>Error Output:</Text>
                                      <pre style={{
                                        backgroundColor: '#fff2f0',
                                        border: '1px solid #ffccc7',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        marginTop: '4px',
                                        fontSize: '13px',
                                        fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
                                        maxHeight: '200px',
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: '1.45',
                                        color: '#cf1322'
                                      }}>
                                        {stderr}
                                      </pre>
                                    </div>
                                  )}
                                  
                                  {/* Task metadata */}
                                  <div style={{ marginBottom: 12 }}>
                                    <Space size="large">
                                      {changed !== undefined && (
                                        <Text>
                                          <Text strong>Changed:</Text> 
                                          <Tag color={changed ? 'orange' : 'green'} style={{ marginLeft: 4 }}>
                                            {changed ? 'Yes' : 'No'}
                                          </Tag>
                                        </Text>
                                      )}
                                      {rc !== undefined && (
                                        <Text>
                                          <Text strong>Return Code:</Text> 
                                          <Tag color={rc === 0 ? 'green' : 'red'} style={{ marginLeft: 4 }}>
                                            {rc}
                                          </Tag>
                                        </Text>
                                      )}
                                    </Space>
                                  </div>
                                  
                                  {/* Full JSON data (collapsible) */}
                                  <Collapse size="small" ghost>
                                    <Collapse.Panel header="View Full JSON Data" key="json">
                                      <pre style={{
                                        backgroundColor: '#f8f9fa',
                                        color: '#212529',
                                        padding: '16px',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
                                        maxHeight: '400px',
                                        overflow: 'auto',
                                        border: '1px solid #dee2e6',
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: '1.45',
                                        margin: 0
                                      }}>
                                        {JSON.stringify(data, null, 2)}
                                      </pre>
                                    </Collapse.Panel>
                                  </Collapse>
                                </div>
                              );
                            } catch (e) {
                              // Fallback to original display
                              return (
                                <div>
                                  <Text strong>Task Summary:</Text>
                                  <pre style={{
                                    backgroundColor: '#f8f9fa',
                                    color: '#212529',
                                    padding: '16px',
                                    borderRadius: '6px',
                                    marginTop: '8px',
                                    fontSize: '13px',
                                    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
                                    maxHeight: '400px',
                                    overflow: 'auto',
                                    border: '1px solid #dee2e6',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.45',
                                    margin: 0
                                  }}>
                                    {typeof artifact.register_data === 'string' 
                                      ? artifact.register_data 
                                      : JSON.stringify(artifact.register_data, null, 2)}
                                  </pre>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </Collapse.Panel>
                    ))}
                  </Collapse>
                )}
              </TabPane>
              
              <TabPane 
                tab={
                  <span>
                    Execution Hosts 
                    <Badge count={selectedExecution?.hosts?.length || 0} style={{ marginLeft: 8 }} />
                  </span>
                } 
                key="hosts"
              >
                {selectedExecution?.hosts && selectedExecution.hosts.length > 0 ? (
                  <List
                    itemLayout="horizontal"
                    dataSource={selectedExecution.hosts}
                    renderItem={(host, index) => (
                      <List.Item
                        actions={[
                          <Tag color="blue" key="hostname">
                            {host.hostname}
                          </Tag>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            <Avatar 
                              icon={<DatabaseOutlined />} 
                              style={{ 
                                backgroundColor: '#1890ff',
                                color: 'white'
                              }} 
                            />
                          }
                          title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 'bold' }}>{host.name}</span>
                              <Tag color="green">Host #{index + 1}</Tag>
                            </div>
                          }
                          description={
                            <div>
                              <div style={{ marginBottom: '4px' }}>
                                <strong>IP Address:</strong> <code>{host.hostname}</code>
                              </div>
                              {host.description && (
                                <div style={{ marginBottom: '4px' }}>
                                  <strong>Description:</strong> {host.description}
                                </div>
                              )}
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                <strong>Added:</strong> {new Date(host.created_at).toLocaleString()}
                              </div>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <DatabaseOutlined style={{ fontSize: '48px', marginBottom: '16px', color: '#d9d9d9' }} />
                    <div>No host information available for this execution</div>
                  </div>
                )}
              </TabPane>
            </Tabs>
          </div>
        )}
      </Modal>

      {/* Rerun Modal */}
      <Modal
        title={
          <Space>
            <RedoOutlined />
            Rerun Playbook - {selectedRerunExecution?.playbook?.name}
          </Space>
        }
        open={rerunModalVisible}
        onCancel={() => setRerunModalVisible(false)}
        width={500}
        footer={null}
      >
        {selectedRerunExecution && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>Playbook:</Text> {selectedRerunExecution.playbook?.name}
                </div>
                <div>
                  <Text strong>Hosts:</Text> {
                    selectedRerunExecution.hosts?.length > 0 
                      ? `${selectedRerunExecution.hosts.length} host(s): ${selectedRerunExecution.hosts.map(h => h.name).join(', ')}`
                      : selectedRerunExecution.host?.name || 'Dynamic targets'
                  }
                </div>
                <div>
                  <Text strong>Original User:</Text> {selectedRerunExecution.username || 'Unknown'}
                </div>
              </Space>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong>Choose authentication method:</Text>
            </div>

            <Space direction="vertical" style={{ width: '100%' }}>
              {credentials.length > 0 && (
                <Card size="small" title="Use Saved Credentials">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text>Select a credential:</Text>
                      <div style={{ marginTop: 8 }}>
                        {credentials
                          .filter(cred => cred.credential_type === 'ssh' || !cred.credential_type) // Show SSH credentials only
                          .map(cred => (
                          <div key={cred.id} style={{ marginBottom: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="radio"
                                name="credential"
                                value={cred.id}
                                checked={selectedCredential === cred.id}
                                onChange={() => setSelectedCredential(cred.id)}
                                style={{ marginRight: 8 }}
                              />
                              <span>
                                <strong>{cred.name}</strong> ({cred.username})
                                {cred.description && <span style={{ color: '#666' }}> - {cred.description}</span>}
                              </span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button 
                      type="primary" 
                      onClick={handleRerunWithCredential}
                      loading={rerunning}
                      disabled={!selectedCredential}
                    >
                      Rerun with Selected Credential
                    </Button>
                  </Space>
                </Card>
              )}

              <Card size="small" title="Use SSH Keys">
                <Space direction="vertical">
                  <Text type="secondary">
                    Use SSH key-based authentication (no password required)
                  </Text>
                  <Button 
                    type="default" 
                    onClick={handleRerunWithoutCredentials}
                    loading={rerunning}
                  >
                    Rerun with SSH Keys
                  </Button>
                </Space>
              </Card>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default History; 