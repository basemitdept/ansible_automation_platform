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
  Spin,
  Avatar,
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

  ApiOutlined,
  StopOutlined
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
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);
  const [outputModalVisible, setOutputModalVisible] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const autoRefresh = true; // Always auto refresh in background
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showAllRecords, setShowAllRecords] = useState(false); // Not used anymore, keeping for compatibility
  const useInfiniteScroll = true; // Always use infinite scroll
  const intervalRef = useRef(null);
  const isPageVisible = useRef(true);
  
  // Cache for full execution details (only load when needed)
  const [executionDetailsCache, setExecutionDetailsCache] = useState(new Map());
  
  
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

  // Initial data load
  useEffect(() => {
    // Reset state and load initial data
    setHistory([]);
    setFilteredHistory([]);
    setCurrentPage(1);
    setHasMore(true);
    fetchHistory(true, true);
  }, []); // Only run on mount

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
    }, 30000); // Refresh every 30 seconds for better performance
  };

  const stopAutoRefresh = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const fetchHistory = async (isManualRefresh = false, reset = false) => {
    await fetchHistoryWithInfiniteScroll(isManualRefresh, reset);
  };

  const fetchHistoryWithInfiniteScroll = async (isManualRefresh = false, reset = false) => {
    const pageToLoad = reset ? 1 : currentPage;
    const recordsPerPage = 25; // Increased to show more records per page
    
    // Show appropriate loading state
    if (isManualRefresh || reset) {
      setLoading(true);
    } else if (pageToLoad > 1) {
      setLoadingMore(true);
    }

    try {
      // Use light=true for faster loading with smaller payloads
      const response = await historyAPI.getPaginatedLight(pageToLoad, recordsPerPage);
      const historyData = response.data.data || response.data;
      const pagination = response.data.pagination || {};
      
      if (reset || pageToLoad === 1) {
        // First load or reset - replace all data
        setHistory(historyData);
        setFilteredHistory(historyData);
        setCurrentPage(1);
      } else {
        // Load more - append to existing data
        setHistory(prev => [...prev, ...historyData]);
        setFilteredHistory(prev => [...prev, ...historyData]);
      }
      
      // Update pagination state
      setTotalRecords(pagination.total || historyData.length);
      setHasMore(pagination.has_next !== false && historyData.length === recordsPerPage);
      setLastRefresh(new Date());
      
      console.log(`⚡ History loaded: ${historyData.length} records (page ${pageToLoad}, total: ${history.length + historyData.length}) - LIGHT MODE`);
    } catch (error) {
      console.error('Failed to fetch execution history', error);
      message.error('Failed to fetch execution history');
    } finally {
      if (isManualRefresh || reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };



  const loadMoreRecords = async () => {
    if (loadingMore || !hasMore) return;
    
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    
    const recordsPerPage = 25; // Match the initial load size
    setLoadingMore(true);

    try {
      const response = await historyAPI.getPaginatedLight(nextPage, recordsPerPage);
      const historyData = response.data.data || response.data;
      const pagination = response.data.pagination || {};
      
      // Append to existing data
      setHistory(prev => [...prev, ...historyData]);
      setFilteredHistory(prev => [...prev, ...historyData]);
      
      // Update pagination state
      setTotalRecords(pagination.total || totalRecords);
      setHasMore(pagination.has_next !== false && historyData.length === recordsPerPage);
      
      console.log(`📊 Loaded more: ${historyData.length} records (page ${nextPage}, total: ${history.length + historyData.length})`);
    } catch (error) {
      console.error('Failed to load more records', error);
      message.error('Failed to load more records');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    
    // Debounce the actual filtering for better performance
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      if (!value) {
        setFilteredHistory(history);
      } else {
        const filtered = history.filter(execution => {
          const searchValue = value.toLowerCase();
          
          // Search in basic fields
          if ((execution.playbook_name && execution.playbook_name.toLowerCase().includes(searchValue)) ||
              (execution.status && execution.status.toLowerCase().includes(searchValue)) ||
            (execution.executed_by && execution.executed_by.toLowerCase().includes(searchValue)) ||
            (execution.execution_id && execution.execution_id.toLowerCase().includes(searchValue)) ||
            (execution.serial_id && execution.serial_id.toString().includes(searchValue))) {
          return true;
        }
        
        // Search in playbook name (nested)
        if (execution.playbook && execution.playbook.name && 
            execution.playbook.name.toLowerCase().includes(searchValue)) {
          return true;
        }
        
        // Search in user information
        if (execution.user && execution.user.username && 
            execution.user.username.toLowerCase().includes(searchValue)) {
          return true;
        }
        
        // Search in webhook information
        if (execution.webhook && execution.webhook.name && 
            execution.webhook.name.toLowerCase().includes(searchValue)) {
          return true;
        }
        
        // Search in hosts information
        const hosts = execution.hosts || [execution.host];
        const validHosts = hosts.filter(host => host);
        for (const host of validHosts) {
          if ((host.name && host.name.toLowerCase().includes(searchValue)) ||
              (host.hostname && host.hostname.toLowerCase().includes(searchValue))) {
            return true;
          }
        }
        
        return false;
      });
      // Keep sort order (newest finished first) after filtering
      const sortedFiltered = filtered.sort((a, b) => {
        // Sort by finished_at first, then by started_at for running tasks
        const finishA = a.finished_at ? new Date(a.finished_at) : null;
        const finishB = b.finished_at ? new Date(b.finished_at) : null;
        
        if (!finishA && !finishB) {
          // Both are running, sort by start time
          const startA = new Date(a.started_at || a.created_at);
          const startB = new Date(b.started_at || b.created_at);
          return startB - startA;
        }
        if (!finishA) return 1; // Running tasks go to bottom
        if (!finishB) return -1;
        return finishB - finishA; // Newest finished first
      });
        setFilteredHistory(sortedFiltered);
      }
    }, 300); // 300ms debounce delay
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
      case 'terminated':
        return <StopOutlined style={{ color: '#ff7875' }} />;
      default:
        return <PlayCircleOutlined />;
    }
  };

  const getStatusTag = (status) => {
    const colors = {
      running: 'processing',
      completed: 'success',
      partial: 'orange',
      failed: 'error',
      terminated: 'volcano'
    };
    
    const statusText = {
      partial: 'PARTIAL SUCCESS',
      terminated: 'TERMINATED',
      default: (status) => status.toUpperCase()
    };
    
    return (
      <Tag color={colors[status]} icon={getStatusIcon(status)}>
        {statusText[status] || statusText.default(status)}
      </Tag>
    );
  };

  // Cache for artifacts to prevent refetching
  const [artifactsCache, setArtifactsCache] = useState(new Map());
  const [outputLoading, setOutputLoading] = useState(false);
  const [artifactHostFilter, setArtifactHostFilter] = useState('');
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  
  // Refs for console output containers
  const consoleOutputRef = useRef(null);
  const errorOutputRef = useRef(null);

  const forceRefreshOutput = async (execution) => {
    if (!execution) return;
    
    console.log('🔄 Force refreshing output for execution:', execution.id);
    setOutputLoading(true);
    
    try {
      // First try the backend refresh endpoint to sync from original task
      try {
        const refreshResponse = await historyAPI.refreshOutput(execution.id);
        if (refreshResponse.data.success) {
          console.log('✅ Backend refresh successful');
          // Use the refreshed execution data from backend
          const refreshedExecution = refreshResponse.data.execution;
          
          // Clear cache and update with fresh data
          executionDetailsCache.delete(execution.id);
          executionDetailsCache.set(execution.id, refreshedExecution);
          setExecutionDetailsCache(new Map(executionDetailsCache));
          setSelectedExecution(refreshedExecution);
          
          message.success('Console output refreshed from original task');
          return;
        }
      } catch (refreshError) {
        console.warn('Backend refresh failed, falling back to regular fetch:', refreshError);
      }
      
      // Fallback: Clear cache and fetch fresh data
      executionDetailsCache.delete(execution.id);
      setExecutionDetailsCache(new Map(executionDetailsCache));
      
      // Fetch fresh execution details
      const response = await historyAPI.getById(execution.id);
      const freshExecution = response.data;
      
      // Update cache and state
      executionDetailsCache.set(execution.id, freshExecution);
      setExecutionDetailsCache(new Map(executionDetailsCache));
      setSelectedExecution(freshExecution);
      
      message.success('Console output refreshed');
    } catch (error) {
      console.error('Failed to refresh execution output:', error);
      message.error('Failed to refresh console output');
    } finally {
      setOutputLoading(false);
    }
  };

  const showOutput = async (execution) => {
    setOutputModalVisible(true);
    setOutputLoading(true);
    
    // Reset host filter for new execution
    setArtifactHostFilter('');
    
    // Set execution immediately for faster modal display
    setSelectedExecution(execution);
    
    // Check if we have full execution details (output fields) from cache
    let fullExecution = execution;
    let needsExecutionFetch = false;
    
    if (executionDetailsCache.has(execution.id)) {
      const cachedExecution = executionDetailsCache.get(execution.id);
      // More aggressive cache validation - only use cache if it has actual output data
      const hasOutput = cachedExecution.output || cachedExecution.error_output;
      const isCompleted = ['completed', 'failed', 'partial', 'terminated'].includes(cachedExecution.status);
      
      if (hasOutput || (isCompleted && cachedExecution.output !== null)) {
        // Cache has output or is a completed execution with explicit null output
        fullExecution = cachedExecution;
      } else {
        // Cache might be incomplete or missing output, fetch fresh data
        needsExecutionFetch = true;
      }
    } else if (!execution.output && !execution.error_output) {
      needsExecutionFetch = true;
    }
    
    // Check if we have artifacts cached
    let needsArtifactsFetch = !artifactsCache.has(execution.id);
    if (artifactsCache.has(execution.id)) {
      setArtifacts(artifactsCache.get(execution.id));
    } else {
      setArtifacts([]);
      setArtifactsLoading(true);
    }
    
    try {
      // Fetch both in parallel if needed
      const promises = [];
      
      if (needsExecutionFetch) {
        console.log('📦 Fetching full execution details for output:', execution.id);
        promises.push(
          historyAPI.getById(execution.id).then(response => {
            fullExecution = response.data;
            // Cache for future use
            executionDetailsCache.set(execution.id, fullExecution);
            setExecutionDetailsCache(new Map(executionDetailsCache));
            setSelectedExecution(fullExecution);
            return fullExecution;
          })
        );
      }
      
      if (needsArtifactsFetch) {
        promises.push(
          artifactsAPI.getByExecution(execution.id, { per_page: 0 }).then(response => {
            // Handle both old and new API response formats
            const artifactsData = response.data?.data || response.data || [];
            // Cache artifacts
            artifactsCache.set(execution.id, artifactsData);
            setArtifactsCache(new Map(artifactsCache));
            setArtifacts(artifactsData);
            return artifactsData;
          })
        );
      }
      
      // Wait for all parallel requests to complete
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      
      // Enhanced auto-refresh for missing output scenarios
      const currentExecution = needsExecutionFetch ? fullExecution : execution;
      
      // Auto-refresh conditions:
      // 1. Completed execution with no output
      // 2. Any execution with status that suggests it should have output but doesn't
      const shouldAutoRefresh = (
        (currentExecution.status === 'completed' || 
         currentExecution.status === 'failed' || 
         currentExecution.status === 'partial' ||
         currentExecution.status === 'terminated') &&
        !currentExecution.output && 
        !currentExecution.error_output &&
        !needsExecutionFetch
      );
      
      if (shouldAutoRefresh) {
        console.log(`⚠️ ${currentExecution.status} execution missing output, attempting auto-refresh...`);
        setAutoRefreshing(true);
        
        // Try multiple refresh attempts with increasing delays
        const refreshAttempts = [
          { method: 'backend', delay: 0 },
          { method: 'fetch', delay: 500 },
          { method: 'backend', delay: 1000 }
        ];
        
        for (const attempt of refreshAttempts) {
          try {
            await new Promise(resolve => setTimeout(resolve, attempt.delay));
            
            if (attempt.method === 'backend') {
              const refreshResponse = await historyAPI.refreshOutput(currentExecution.id);
              if (refreshResponse.data.success) {
                const refreshedExecution = refreshResponse.data.execution;
                if (refreshedExecution.output || refreshedExecution.error_output) {
                  executionDetailsCache.set(currentExecution.id, refreshedExecution);
                  setExecutionDetailsCache(new Map(executionDetailsCache));
                  setSelectedExecution(refreshedExecution);
                  console.log(`✅ Auto-refresh successful from backend sync (attempt ${refreshAttempts.indexOf(attempt) + 1})`);
                  return; // Exit early since we got the data
                }
              }
            } else if (attempt.method === 'fetch') {
              const response = await historyAPI.getById(currentExecution.id);
              const refreshedExecution = response.data;
              if (refreshedExecution.output || refreshedExecution.error_output) {
                executionDetailsCache.set(currentExecution.id, refreshedExecution);
                setExecutionDetailsCache(new Map(executionDetailsCache));
                setSelectedExecution(refreshedExecution);
                console.log(`✅ Auto-refresh successful from regular fetch (attempt ${refreshAttempts.indexOf(attempt) + 1})`);
                return; // Exit early since we got the data
              }
            }
          } catch (error) {
            console.warn(`Auto-refresh attempt ${refreshAttempts.indexOf(attempt) + 1} (${attempt.method}) failed:`, error);
          }
        }
        
        console.log('⚠️ All auto-refresh attempts completed but still no output found');
        setAutoRefreshing(false);
      }
      
    } catch (error) {
      console.error('Failed to fetch execution details or artifacts:', error);
      message.error('Failed to load execution data');
    } finally {
      setOutputLoading(false);
      setArtifactsLoading(false);
      setAutoRefreshing(false);
      
      // Reset scroll position after loading completes
      setTimeout(() => {
        if (consoleOutputRef.current) {
          consoleOutputRef.current.scrollTop = 0;
        }
        if (errorOutputRef.current) {
          errorOutputRef.current.scrollTop = 0;
        }
      }, 100);
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
      width: 60,
    },
    {
      title: 'Playbook',
      dataIndex: ['playbook', 'name'],
      key: 'playbook',
      width: 160,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text} placement="topLeft">
          <strong style={{ display: 'inline-block', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text}
          </strong>
        </Tooltip>
      ),
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
      width: 90,
      filters: [
        { text: 'Completed', value: 'completed' },
        { text: 'Partial Success', value: 'partial' },
        { text: 'Failed', value: 'failed' },
        { text: 'Terminated', value: 'terminated' },
        { text: 'Running', value: 'running' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'User',
      key: 'user',
      render: (_, record) => {
        const icon = record.executed_by_type === 'webhook' ? <ApiOutlined /> : <UserOutlined />;
        const name = record.user?.username || 'Unknown';
        
        return (
          <Space>
            {icon}
            <span style={{ color: record.executed_by_type === 'webhook' ? '#1890ff' : 'inherit' }}>
              {name}
            </span>
          </Space>
        );
      },
      width: 90,
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
      width: 130,
      sorter: (a, b) => moment(a.started_at).unix() - moment(b.started_at).unix(),
    },
    {
      title: 'Finished',
      dataIndex: 'finished_at',
      key: 'finished_at',
      render: (date) => {
        if (!date) return 'Still running...';
        const momentDate = moment(date);
        return momentDate.isValid() ? momentDate.format('MMM DD, YYYY HH:mm:ss') : '-';
      },
      width: 130,
      sorter: (a, b) => {
        // Handle null values (still running tasks)
        if (!a.finished_at && !b.finished_at) return 0;
        if (!a.finished_at) return 1; // Still running tasks go to the bottom
        if (!b.finished_at) return -1;
        return moment(a.finished_at).unix() - moment(b.finished_at).unix();
      },
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
      width: 80,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => showOutput(record)}
            title="View Output"
            size="small"
          />
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
              size="small"
            />
          </Popconfirm>
        </Space>
      ),
      width: 120,
      fixed: 'right',
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <HistoryOutlined />
            <Title level={4} style={{ margin: 0 }}>Execution History</Title>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              ({filteredHistory.length} of {totalRecords || '?'} records loaded)
            </Text>
          </Space>
        }
        extra={
          <Space>
            <Input.Search
              placeholder="Search executions..."
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Button onClick={() => fetchHistory(true)} loading={loading} icon={<ReloadOutlined />}>
              Refresh
            </Button>

          </Space>
        }
        className="card-container"
        style={{ width: '100%', overflow: 'auto' }}
      >
        <div>
          <Table
            columns={columns}
            dataSource={filteredHistory}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={{ 
              x: 'max-content', 
              y: 'calc(100vh - 250px)',
              scrollToFirstRowOnChange: false
            }}
            size="small"
            showSorterTooltip={false}
            onScroll={(e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.target;
              // Load more when user scrolls to within 200px of bottom
              if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore) {
                console.log('🔄 Loading more records...', { scrollTop, scrollHeight, clientHeight });
                loadMoreRecords();
              }
            }}
          />
          {loadingMore && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Spin size="small" />
              <span style={{ marginLeft: 8 }}>Loading more records...</span>
            </div>
          )}
          {!hasMore && filteredHistory.length > 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
              <Text type="secondary">All {filteredHistory.length} records loaded</Text>
            </div>
          )}
        </div>
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
                  <Text strong>Hosts:</Text> 
                  {(() => {
                    const hosts = selectedExecution.hosts || [selectedExecution.host];
                    const validHosts = hosts.filter(host => host);
                    
                    if (validHosts.length === 0) {
                      return <span style={{ color: '#999' }}>No hosts</span>;
                    }
                    
                    if (validHosts.length === 1) {
                      const host = validHosts[0];
                      return (
                        <span>
                          {host.name} ({host.hostname})
                        </span>
                      );
                    }
                    
                    return (
                      <div>
                        <div style={{ marginBottom: 4 }}>
                          <Tag color="blue">{validHosts.length} hosts</Tag>
                        </div>
                        <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: '6px', padding: '8px', backgroundColor: '#fafafa' }}>
                          {validHosts.map((host, index) => (
                            <div key={index} style={{ fontSize: '12px', marginBottom: '4px', padding: '2px 0' }}>
                              <span style={{ fontWeight: '500' }}>{host.name}</span> <code>({host.hostname})</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Text strong>Status:</Text> {getStatusTag(selectedExecution.status)}
                </div>
                <div>
                  <Text strong>User:</Text> {
                    (() => {
                      const icon = selectedExecution.executed_by_type === 'webhook' ? <ApiOutlined /> : <UserOutlined />;
                      const name = selectedExecution.user?.username || 'Unknown';
                      return (
                        <span style={{ color: selectedExecution.executed_by_type === 'webhook' ? '#1890ff' : 'inherit' }}>
                          {icon} {name}
                        </span>
                      );
                    })()
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

            <Tabs 
              defaultActiveKey="output"
              tabBarExtraContent={
                <Button 
                  icon={<ReloadOutlined />} 
                  size="small" 
                  onClick={() => forceRefreshOutput(selectedExecution)}
                  loading={outputLoading}
                  title="Refresh console output"
                >
                  Refresh
                </Button>
              }
            >
              <TabPane tab="Console Output" key="output">
                {outputLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: '#666' }}>
                      {autoRefreshing ? 'Auto-refreshing missing output...' : 'Loading execution output...'}
                    </div>
                  </div>
                ) : (
                  <>
                    {selectedExecution?.output && (
                      <div
                        ref={consoleOutputRef}
                        style={{
                          backgroundColor: '#1f1f1f',
                          color: '#fff',
                          padding: '16px',
                          borderRadius: '6px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          maxHeight: '400px',
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          border: '1px solid #333'
                        }}
                      >
                        {selectedExecution.output}
                      </div>
                    )}
                    
                    {selectedExecution?.error_output && (
                      <div style={{ marginTop: 16 }}>
                        <Text strong style={{ color: '#ff4d4f' }}>Error Output:</Text>
                        <div
                          ref={errorOutputRef}
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
                            whiteSpace: 'pre-wrap',
                            border: '1px solid #8b5a5a'
                          }}
                        >
                          {selectedExecution.error_output}
                        </div>
                      </div>
                    )}
                    
                    {!selectedExecution?.output && !selectedExecution?.error_output && (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                        <div>No console output available for this execution</div>
                        <div style={{ marginTop: 8, fontSize: '12px' }}>
                          {selectedExecution?.status === 'running' ? (
                            <>
                              This execution is still running. Output will appear as the task progresses.
                              <br />
                              You can refresh manually to check for new output.
                            </>
                          ) : (
                            <>
                              This might occur if the execution failed to save output or the output was lost.
                              <br />
                              The system has automatically tried to recover the output.
                              <br />
                              Try refreshing manually using the refresh button above.
                            </>
                          )}
                        </div>
                        {selectedExecution?.status && (
                          <div style={{ marginTop: 12, fontSize: '11px', color: '#999' }}>
                            Execution Status: {selectedExecution.status}
                          </div>
                        )}
                      </div>
                    )}
                    

                  </>
                )}
              </TabPane>
              
              <TabPane 
                tab={
                  <span>
                    Register Artifacts 
                    <Badge 
                      count={artifactsLoading ? <Spin size="small" /> : 
                        artifactHostFilter ? 
                          artifacts.filter(a => a.host_name.toLowerCase().includes(artifactHostFilter.toLowerCase())).length :
                          artifacts.length
                      } 
                      style={{ marginLeft: 8 }} 
                      showZero={false}
                    />
                  </span>
                } 
                key="artifacts"
              >
                {artifactsLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: '#666' }}>Loading register variables...</div>
                  </div>
                ) : artifacts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <div>No register variables found for this execution</div>
                  </div>
                ) : (
                  <>
                    {artifacts.length > 10 && (
                      <div style={{ marginBottom: 16 }}>
                        <Input.Search
                          placeholder="Filter by host name..."
                          value={artifactHostFilter}
                          onChange={(e) => setArtifactHostFilter(e.target.value)}
                          style={{ marginBottom: 8 }}
                          allowClear
                        />
                        {artifacts.length > 50 && (
                          <Alert 
                            message={`Showing ${artifacts.filter(a => 
                              artifactHostFilter === '' || 
                              a.host_name.toLowerCase().includes(artifactHostFilter.toLowerCase())
                            ).length} of ${artifacts.length} artifacts from multiple hosts`} 
                            type="info" 
                            showIcon
                          />
                        )}
                      </div>
                    )}
                    <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                      <Collapse>
                        {artifacts
                          .filter(artifact => 
                            artifactHostFilter === '' || 
                            artifact.host_name.toLowerCase().includes(artifactHostFilter.toLowerCase())
                          )
                          .map((artifact) => (
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
                    </div>
                  </>
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


    </div>
  );
};

export default History; 