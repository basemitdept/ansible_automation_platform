import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Select,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Typography,
  Alert,
  Divider,
  InputNumber,
  Switch,
  Radio,
  Tag
} from 'antd';
import {
  PlayCircleOutlined,
  CodeOutlined,
  DatabaseOutlined,
  LockOutlined,
  UserOutlined,
  SettingOutlined,
  GroupOutlined,
  KeyOutlined
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { playbooksAPI, hostsAPI, hostGroupsAPI, tasksAPI, credentialsAPI, variablesAPI } from '../services/api';
import { hasPermission } from '../utils/permissions';

const { Title } = Typography;
const { Option } = Select;

const PlaybookEditor = ({ currentUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [playbooks, setPlaybooks] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [hostGroups, setHostGroups] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [globalVariables, setGlobalVariables] = useState([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState(null);
  const [selectedHosts, setSelectedHosts] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [targetType, setTargetType] = useState('hosts'); // 'hosts' or 'groups'
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [editorContent, setEditorContent] = useState('');
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [customAuth, setCustomAuth] = useState(false);
  const [variableValues, setVariableValues] = useState({});
  const [selectedVariables, setSelectedVariables] = useState([]);
  const [form] = Form.useForm();
  const [variablesForm] = Form.useForm();

  useEffect(() => {
    fetchPlaybooks();
    fetchHosts();
    fetchHostGroups();
    fetchCredentials();
    fetchGlobalVariables();
  }, []);

  // Handle pre-selected playbook from navigation
  useEffect(() => {
    if (location.state?.selectedPlaybook) {
      const preSelectedPlaybook = location.state.selectedPlaybook;
      setSelectedPlaybook(preSelectedPlaybook);
      setEditorContent(preSelectedPlaybook.content || '');
      
      // Set assigned variables if any
      if (preSelectedPlaybook.assigned_variables) {
        setSelectedVariables(preSelectedPlaybook.assigned_variables);
      }
      
      // Extract variables from content
      const extractedVars = extractVariablesFromContent(preSelectedPlaybook.content);
      if (extractedVars.length > 0) {
        setSelectedVariables(prev => [...prev, ...extractedVars]);
      }
    }
  }, [location.state, playbooks]);



  const fetchPlaybooks = async () => {
    try {
      const response = await playbooksAPI.getAll();
      setPlaybooks(response.data);
    } catch (error) {
      message.error('Failed to fetch playbooks');
    }
  };

  const fetchHosts = async () => {
    try {
      const response = await hostsAPI.getAll();
      setHosts(response.data);
      
      // No automatic host selection - user must choose manually
      
    } catch (error) {
      message.error('Failed to fetch hosts');
    }
  };

  const fetchHostGroups = async () => {
    try {
      const response = await hostGroupsAPI.getAll();
      setHostGroups(response.data);
    } catch (error) {
      message.error('Failed to fetch host groups');
    }
  };

  const fetchCredentials = async () => {
    try {
      const response = await credentialsAPI.getAll();
      setCredentials(response.data);
      // Set default credential if available
      const defaultCred = response.data.find(cred => cred.is_default);
      if (defaultCred) {
        setSelectedCredential(defaultCred.id);
      }
    } catch (error) {
      message.error('Failed to fetch credentials');
    }
  };

  const fetchGlobalVariables = async () => {
    try {
      const response = await variablesAPI.getForExecution();
      setGlobalVariables(response.data);
    } catch (error) {
      message.error('Failed to fetch global variables');
    }
  };

  const extractVariablesFromContent = (content) => {
    if (!content) return [];
    
    // Extract variables using regex to find {{ variable_name }} patterns
    const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    const variables = new Set();
    let match;
    
    while ((match = variableRegex.exec(content)) !== null) {
      variables.add(match[1]);
    }
    
    return Array.from(variables).map(varName => ({
      name: varName,
      type: 'string',
      required: true
    }));
  };

  const getTargetHostIds = () => {
    if (targetType === 'hosts') {
      return selectedHosts;
    } else {
      // Get all host IDs from selected groups
      const hostIds = [];
      selectedGroups.forEach(groupId => {
        const groupHosts = hosts.filter(host => {
          // Check if host belongs to group via single group_id OR multiple groups
          if (host.group_id === groupId) {
            return true;
          }
          
          // Check if host belongs to group via groups array
          if (host.groups && host.groups.length > 0) {
            return host.groups.some(group => group.id === groupId);
          }
          
          return false;
        });
        hostIds.push(...groupHosts.map(host => host.id));
      });
      return [...new Set(hostIds)]; // Remove duplicates
    }
  };

  const getTargetCount = () => {
    if (targetType === 'hosts') {
      return selectedHosts.length;
    } else {
      return getTargetHostIds().length;
    }
  };

  const handlePlaybookSelect = (playbookId) => {
    const playbook = playbooks.find(p => p.id === playbookId);
    setSelectedPlaybook(playbook);
    setEditorContent(playbook?.content || '');
    
    // Extract variables from playbook content
    const detectedVariables = extractVariablesFromContent(playbook?.content);
    
    // Get assigned variables for this playbook
    const assignedVariableIds = playbook?.assigned_variables || [];
    const assignedGlobalVars = globalVariables.filter(gv => assignedVariableIds.includes(gv.id));
    
    // Initialize variable values - only use assigned global variables
    const initialValues = {};
    const initialSelectedVars = [];
    
    detectedVariables.forEach(variable => {
      const assignedVar = assignedGlobalVars.find(gv => gv.key === variable.name);
      if (assignedVar) {
        // Use assigned global variable value
        initialValues[variable.name] = assignedVar.value;
        initialSelectedVars.push(variable.name);
      } else {
        // No assigned global variable, user needs to provide value
        initialValues[variable.name] = '';
      }
    });
    
    setVariableValues(initialValues);
    setSelectedVariables(initialSelectedVars);
    variablesForm.setFieldsValue(initialValues);
  };

  const handleVariableChange = (changedValues, allValues) => {
    setVariableValues(allValues);
  };

  const handleEditorChange = (value) => {
    setEditorContent(value);
    
    // Re-detect variables when content changes
    if (selectedPlaybook) {
      const detectedVariables = extractVariablesFromContent(value);
      const currentValues = variablesForm.getFieldsValue();
      const newValues = {};
      const newSelectedVars = [];
      
      // Get assigned variables for this playbook
      const assignedVariableIds = selectedPlaybook?.assigned_variables || [];
      const assignedGlobalVars = globalVariables.filter(gv => assignedVariableIds.includes(gv.id));
      
      // Keep existing values for variables that still exist
      detectedVariables.forEach(variable => {
        const assignedVar = assignedGlobalVars.find(gv => gv.key === variable.name);
        if (assignedVar && !currentValues[variable.name]) {
          // Use assigned global variable value if no current value exists
          newValues[variable.name] = assignedVar.value;
          newSelectedVars.push(variable.name);
        } else {
          // Keep existing value or set empty
          newValues[variable.name] = currentValues[variable.name] || '';
          if (assignedVar && currentValues[variable.name] === assignedVar.value) {
            newSelectedVars.push(variable.name);
          }
        }
      });
      
      setVariableValues(newValues);
      setSelectedVariables(newSelectedVars);
      variablesForm.setFieldsValue(newValues);
    }
  };

  const handleExecute = async () => {
    if (!selectedPlaybook) {
      message.warning('Please select a playbook');
      return;
    }
    
    const targetHostIds = getTargetHostIds();
    
    // Require host selection - no longer allow empty hosts
    if (!targetHostIds || targetHostIds.length === 0) {
      message.warning('Please select at least one host or host group');
      return;
    }
    
    // Only validate variables if they exist in the playbook
    const detectedVariables = extractVariablesFromContent(selectedPlaybook.content);
    if (detectedVariables.length > 0) {
      try {
        await variablesForm.validateFields();
      } catch (error) {
        message.warning('Please fill in all required variables');
        return;
      }
    }
    
    // Check for no-credentials first
    if (selectedCredential === 'no-credentials') {
      // Execute without credentials (use SSH keys)
      executeWithoutCredentials();
    } else if (selectedCredential && !customAuth) {
      // If a credential is selected and not using custom auth, execute directly
      executeWithCredential();
    } else {
      // Show auth modal for custom credentials
      form.resetFields();
      setAuthModalVisible(true);
    }
  };

  const executeWithCredential = async () => {
    if (!selectedCredential) {
      message.warning('Please select a credential or use custom authentication');
      return;
    }

    setExecuting(true);
    try {
      // Get the credential password
      const credResponse = await credentialsAPI.getPassword(selectedCredential);
      const credential = credentials.find(c => c.id === selectedCredential);
      
      const targetHostIds = getTargetHostIds();
      const response = await tasksAPI.execute({
        playbook_id: selectedPlaybook.id,
        host_ids: targetHostIds,
        username: credential.username,
        password: credResponse.data.password,
        variables: variableValues
      });

      const hostCount = targetHostIds?.length || 0;
      let targetInfo;
      if (hostCount > 0) {
        targetInfo = `${hostCount} selected host(s)`;
      } else if (variableValues && (variableValues.ips || variableValues.hosts)) {
        targetInfo = 'dynamic targets from variables';
      } else {
        targetInfo = 'playbook-defined targets';
      }
      
      message.success(`Playbook execution started on ${targetInfo}`);
      
      // Navigate to the task detail page
      if (response.data.task && response.data.task.id) {
        navigate(`/tasks/${response.data.task.id}`);
      }
      
    } catch (error) {
      console.error('Execution error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to execute playbook';
      message.error(`Failed to execute playbook: ${errorMessage}`);
    } finally {
      setExecuting(false);
    }
  };

  const executeWithoutCredentials = async () => {
    setExecuting(true);
    try {
      const targetHostIds = getTargetHostIds();
      const response = await tasksAPI.execute({
        playbook_id: selectedPlaybook.id,
        host_ids: targetHostIds,
        // No username/password - backend will use SSH keys
        variables: variableValues
      });

      const hostCount = targetHostIds?.length || 0;
      let targetInfo;
      if (hostCount > 0) {
        targetInfo = `${hostCount} selected host(s)`;
      } else if (variableValues && (variableValues.ips || variableValues.hosts)) {
        targetInfo = 'dynamic targets from variables';
      } else {
        targetInfo = 'playbook-defined targets';
      }
      
      message.success(`Playbook execution started on ${targetInfo} using SSH keys`);
      
      // Navigate to the task detail page
      if (response.data.task && response.data.task.id) {
        navigate(`/tasks/${response.data.task.id}`);
      }
      
    } catch (error) {
      console.error('Execution error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to execute playbook';
      message.error(`Failed to execute playbook: ${errorMessage}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleAuthSubmit = async (values) => {
    setExecuting(true);
    try {
      const targetHostIds = getTargetHostIds();
      const response = await tasksAPI.execute({
        playbook_id: selectedPlaybook.id,
        host_ids: targetHostIds,
        username: values.username,
        password: values.password,
        variables: variableValues
      });

      const hostCount = targetHostIds?.length || 0;
      let targetInfo;
      if (hostCount > 0) {
        targetInfo = `${hostCount} selected host(s)`;
      } else if (variableValues && (variableValues.ips || variableValues.hosts)) {
        targetInfo = 'dynamic targets from variables';
      } else {
        targetInfo = 'playbook-defined targets';
      }
      
      message.success(`Playbook execution started on ${targetInfo}`);
      setAuthModalVisible(false);
      
      // Navigate to the task detail page
      if (response.data.task && response.data.task.id) {
        navigate(`/tasks/${response.data.task.id}`);
      }
      
    } catch (error) {
      console.error('Execution error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to execute playbook';
      message.error(`Failed to execute playbook: ${errorMessage}`);
    } finally {
      setExecuting(false);
    }
  };

  const editorOptions = {
    selectOnLineNumbers: true,
    automaticLayout: true,
    minimap: { enabled: true, side: 'right' },
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: false,
    wordWrap: 'on',
    folding: true,
    foldingHighlight: true,
    showFoldingControls: 'always',
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    suggest: {
      enabled: true,
      showKeywords: true,
      showSnippets: true,
    },
    quickSuggestions: {
      other: true,
      comments: true,
      strings: true,
    },
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    accessibilitySupport: 'auto',
    autoIndent: 'full',
    contextmenu: true,
    copyWithSyntaxHighlighting: true,
    cursorBlinking: 'blink',
    cursorSmoothCaretAnimation: true,
    cursorWidth: 2,
    disableLayerHinting: false,
    disableMonospaceOptimizations: false,
    dragAndDrop: true,
    emptySelectionClipboard: true,
    extraEditorClassName: '',
    fastScrollSensitivity: 5,
    find: {
      cursorMoveOnType: true,
      seedSearchStringFromSelection: true,
      autoFindInSelection: 'never',
    },
    fixedOverflowWidgets: false,
    hover: { enabled: true, delay: 300 },
    inDiffEditor: false,
    letterSpacing: 0,
    lightbulb: { enabled: true },
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 3,
    links: true,
    matchBrackets: 'always',
    mouseWheelScrollSensitivity: 1,
    mouseWheelZoom: true,
    multiCursorMergeOverlapping: true,
    multiCursorModifier: 'alt',
    overviewRulerBorder: true,
    overviewRulerLanes: 2,
    padding: { top: 10, bottom: 10 },
    parameterHints: { enabled: true, cycle: false },
    peekWidgetDefaultFocus: 'tree',
    renderControlCharacters: false,
    renderFinalNewline: true,
    renderLineHighlight: 'line',
    renderValidationDecorations: 'editable',
    renderWhitespace: 'selection',
    revealHorizontalRightPadding: 30,
    rulers: [],
    scrollbar: {
      useShadows: false,
      verticalHasArrows: false,
      horizontalHasArrows: false,
      vertical: 'visible',
      horizontal: 'visible',
      verticalScrollbarSize: 14,
      horizontalScrollbarSize: 12,
      arrowSize: 11,
    },
    smoothScrolling: true,
    snippetSuggestions: 'top',
    stopRenderingLineAfter: 10000,
    tabCompletion: 'on',
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: true,
    trimAutoWhitespace: true,
    useTabStops: true,
    wordSeparators: '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?',
    wordWrapBreakAfterCharacters: '\t})]?|&,;',
    wordWrapBreakBeforeCharacters: '{([+',
    wordWrapColumn: 80,
    wrappingIndent: 'none',
    wrappingStrategy: 'simple',
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <CodeOutlined />
            <Title level={4} style={{ margin: 0 }}>Playbook Editor & Executor</Title>
          </Space>
        }
        className="card-container"
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              Select Playbook:
            </label>
            <Select
              style={{ width: '100%' }}
              placeholder="Choose a playbook to edit"
              value={selectedPlaybook?.id}
              onChange={handlePlaybookSelect}
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {playbooks.map(playbook => (
                <Option key={playbook.id} value={playbook.id}>
                  {playbook.name}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={8}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              Target Selection: <span style={{ color: '#ff4d4f' }}>*</span>
            </label>
            <div style={{ marginBottom: 8 }}>
              <Radio.Group 
                value={targetType} 
                onChange={(e) => {
                  const newTargetType = e.target.value;
                  setTargetType(newTargetType);
                  
                  // Clear selections when switching target types
                  setSelectedHosts([]);
                  setSelectedGroups([]);
                }}
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="hosts">
                  <DatabaseOutlined /> Individual Hosts
                </Radio.Button>
                <Radio.Button value="groups">
                  <GroupOutlined /> Host Groups
                </Radio.Button>
              </Radio.Group>
            </div>
            
            {targetType === 'hosts' ? (
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Choose target hosts (multiple selection)"
                value={selectedHosts}
                onChange={setSelectedHosts}
                showSearch
                filterOption={(input, option) => {
                  const host = hosts.find(h => h.id === option.value);
                  if (!host) return false;
                  const searchText = `${host.name} ${host.hostname}`.toLowerCase();
                  return searchText.indexOf(input.toLowerCase()) >= 0;
                }}
                maxTagCount="responsive"
              >
                {hosts.map(host => (
                  <Option key={host.id} value={host.id}>
                    <Space>
                      <DatabaseOutlined />
                      {host.name} ({host.hostname})
                      {host.group && (
                        <Tag color={host.group.color} size="small">
                          {host.group.name}
                        </Tag>
                      )}
                    </Space>
                  </Option>
                ))}
              </Select>
            ) : (
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Choose target groups (multiple selection)"
                value={selectedGroups}
                onChange={setSelectedGroups}
                showSearch
                filterOption={(input, option) => {
                  const group = hostGroups.find(g => g.id === option.value);
                  if (!group) return false;
                  const searchText = `${group.name} ${group.description || ''}`.toLowerCase();
                  return searchText.indexOf(input.toLowerCase()) >= 0;
                }}
                maxTagCount="responsive"
              >
                {hostGroups.map(group => (
                  <Option key={group.id} value={group.id}>
                    <Space>
                      <GroupOutlined style={{ color: group.color }} />
                      {group.name}
                      <Tag color={group.color} size="small">
                        {group.host_count} hosts
                      </Tag>
                    </Space>
                  </Option>
                ))}
              </Select>
            )}
            
            {getTargetCount() > 0 && (
              <div style={{ marginTop: 4, fontSize: '12px', color: '#666' }}>
                {getTargetCount()} host{getTargetCount() !== 1 ? 's' : ''} selected
              </div>
            )}
          </Col>
          <Col span={8}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              SSH Credentials:
            </label>
            <Select
              style={{ width: '100%', marginBottom: 16 }}
              placeholder="Select saved credentials or use custom"
              value={selectedCredential}
              onChange={setSelectedCredential}
              allowClear
              showSearch
              filterOption={(input, option) => {
                if (option.value === 'no-credentials') {
                  const searchText = 'no credentials ssh keys';
                  return searchText.indexOf(input.toLowerCase()) >= 0;
                }
                const cred = credentials.find(c => c.id === option.value);
                if (!cred) return false;
                const searchText = `${cred.name} ${cred.username}`.toLowerCase();
                return searchText.indexOf(input.toLowerCase()) >= 0;
              }}
            >
              <Option key="no-credentials" value="no-credentials">
                <Space>
                  <KeyOutlined />
                  <span style={{ color: '#52c41a' }}>No credentials (SSH keys)</span>
                </Space>
              </Option>
              {credentials
                .filter(cred => cred.credential_type === 'ssh' || !cred.credential_type) // Show SSH credentials only
                .map(cred => (
                <Option key={cred.id} value={cred.id}>
                  <Space>
                    <UserOutlined />
                    {cred.name} ({cred.username})
                    {cred.is_default && <span style={{ color: '#faad14' }}>★</span>}
                  </Space>
                </Option>
              ))}
            </Select>
            
            <div style={{ marginBottom: 16 }}>
              <Button
                type="link"
                onClick={() => setCustomAuth(!customAuth)}
                style={{ padding: 0, height: 'auto' }}
              >
                {customAuth ? 'Use Saved Credentials' : 'Use Custom Credentials'}
              </Button>
            </div>
            
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              Actions:
            </label>
            {hasPermission(currentUser, 'execute') ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleExecute}
                disabled={!selectedPlaybook || getTargetCount() === 0 || (!selectedCredential && !customAuth)}
                loading={executing}
                size="large"
              >
                Execute Playbook
              </Button>
            ) : (
              <Alert
                message="Permission Required"
                description="You need execution permissions to run playbooks."
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
            
            {getTargetCount() === 0 && (
              <div style={{ marginTop: 8, fontSize: '12px', color: '#ff4d4f' }}>
                Please select at least one host or host group to execute the playbook
              </div>
            )}
            
            {getTargetCount() > 0 && !selectedCredential && !customAuth && (
              <div style={{ marginTop: 8, fontSize: '12px', color: '#ff4d4f' }}>
                Please select an authentication method: saved credentials, SSH keys, or custom authentication
              </div>
            )}
          </Col>
        </Row>

        {selectedPlaybook && (() => {
          const detectedVariables = extractVariablesFromContent(selectedPlaybook.content);
          return detectedVariables.length > 0 && (
            <Card 
              title={
                <Space>
                  <SettingOutlined />
                  Playbook Variables
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    ({detectedVariables.length} detected)
                  </span>
                </Space>
              }
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Alert
                message="Variables Detected"
                description={`Found ${detectedVariables.length} variable(s) in your playbook. Only variables assigned to this playbook can use global values.`}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Form
                form={variablesForm}
                layout="vertical"
                onValuesChange={handleVariableChange}
              >
                <Row gutter={16}>
                  {detectedVariables.map((variable, index) => {
                    const assignedVariableIds = selectedPlaybook?.assigned_variables || [];
                    const assignedGlobalVars = globalVariables.filter(gv => assignedVariableIds.includes(gv.id));
                    const assignedVar = assignedGlobalVars.find(gv => gv.key === variable.name);
                    const isUsingAssigned = selectedVariables.includes(variable.name);
                    
                    return (
                      <Col span={8} key={variable.name}>
                        <Form.Item
                          label={
                            <Space>
                              <span style={{ fontWeight: 'bold' }}>{variable.name}</span>
                              {assignedVar ? (
                                <Tag color={isUsingAssigned ? 'green' : 'orange'} size="small">
                                  {isUsingAssigned ? 'Using Assigned' : 'Assigned Available'}
                                </Tag>
                              ) : (
                                <Tag color="red" size="small">
                                  Not Assigned
                                </Tag>
                              )}
                            </Space>
                          }
                          name={variable.name}
                          rules={[{ required: true, message: `${variable.name} is required` }]}
                          extra={assignedVar && !isUsingAssigned ? (
                            <Button 
                              type="link" 
                              size="small" 
                              style={{ padding: 0, height: 'auto' }}
                              onClick={() => {
                                const newValues = { ...variableValues, [variable.name]: assignedVar.value };
                                setVariableValues(newValues);
                                setSelectedVariables([...selectedVariables, variable.name]);
                                variablesForm.setFieldsValue(newValues);
                              }}
                            >
                              Use assigned value: "{assignedVar.value}"
                            </Button>
                          ) : !assignedVar ? (
                            <span style={{ color: '#ff4d4f', fontSize: '12px' }}>
                              This variable is not assigned to this playbook. Go to Playbooks page to assign variables.
                            </span>
                          ) : null}
                        >
                          <Input 
                            placeholder={assignedVar ? `Assigned: ${assignedVar.value}` : `Enter value for ${variable.name}`}
                            style={{ width: '100%' }}
                            suffix={assignedVar && isUsingAssigned && (
                              <Button 
                                type="text" 
                                size="small"
                                onClick={() => {
                                  const newSelectedVars = selectedVariables.filter(v => v !== variable.name);
                                  setSelectedVariables(newSelectedVars);
                                }}
                                title="Use custom value instead"
                              >
                                ×
                              </Button>
                            )}
                          />
                        </Form.Item>
                      </Col>
                    );
                  })}
                </Row>
              </Form>
            </Card>
          );
        })()}

        {selectedPlaybook && (
          <Alert
            message={`Editing: ${selectedPlaybook.name}`}
            description={selectedPlaybook.description}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <div 
          style={{ 
            height: '600px', 
            border: '1px solid #3c3c3c',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            background: '#1e1e1e'
          }}
        >
          <div 
            style={{
              height: '32px',
              background: 'linear-gradient(to bottom, #3c3c3c, #2d2d30)',
              borderBottom: '1px solid #2d2d30',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '12px',
              fontSize: '12px',
              color: '#cccccc',
              fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
            }}
          >
            <span style={{ marginRight: '8px' }}>📄</span>
            <span>{selectedPlaybook ? `${selectedPlaybook.name}.yml` : 'playbook.yml'}</span>
            {/* Removed macOS-style window control dots */}
          </div>
          <Editor
            height="calc(100% - 32px)"
            language="yaml"
            value={editorContent}
            onChange={handleEditorChange}
            options={editorOptions}
            theme="vs-dark"
            beforeMount={(monaco) => {
              // Register YAML snippets for Ansible
              monaco.languages.registerCompletionItemProvider('yaml', {
                provideCompletionItems: (model, position) => {
                  const suggestions = [
                    {
                      label: 'playbook',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: [
                        '---',
                        '- name: ${1:Playbook Description}',
                        '  hosts: ${2:all}',
                        '  become: ${3:yes}',
                        '  tasks:',
                        '    - name: ${4:Task Description}',
                        '      ${5:module_name}:',
                        '        ${6:parameter}: ${7:value}'
                      ].join('\n'),
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      documentation: 'Basic Ansible playbook structure'
                    },
                    {
                      label: 'task',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: [
                        '- name: ${1:Task Description}',
                        '  ${2:module_name}:',
                        '    ${3:parameter}: ${4:value}'
                      ].join('\n'),
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      documentation: 'Ansible task template'
                    },
                    {
                      label: 'shell',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: [
                        '- name: ${1:Execute shell command}',
                        '  shell: ${2:command}',
                        '  register: ${3:result}'
                      ].join('\n'),
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      documentation: 'Shell module task'
                    },
                    {
                      label: 'copy',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: [
                        '- name: ${1:Copy file}',
                        '  copy:',
                        '    src: ${2:source_file}',
                        '    dest: ${3:destination_path}',
                        '    mode: ${4:0644}'
                      ].join('\n'),
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      documentation: 'Copy module task'
                    },
                    {
                      label: 'service',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: [
                        '- name: ${1:Manage service}',
                        '  service:',
                        '    name: ${2:service_name}',
                        '    state: ${3:started}',
                        '    enabled: ${4:yes}'
                      ].join('\n'),
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      documentation: 'Service module task'
                    }
                  ];
                  return { suggestions };
                }
              });
            }}
          />
        </div>

        {selectedPlaybook && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button
              type="default"
              onClick={() => {
                // Update playbook content
                playbooksAPI.update(selectedPlaybook.id, {
                  ...selectedPlaybook,
                  content: editorContent
                }).then(() => {
                  message.success('Playbook saved successfully');
                  fetchPlaybooks();
                }).catch(() => {
                  message.error('Failed to save playbook');
                });
              }}
            >
              Save Changes
            </Button>
          </div>
        )}
      </Card>

      {/* Authentication Modal */}
      <Modal
        title={
          <Space>
            <LockOutlined />
            Server Authentication Required
          </Space>
        }
        open={authModalVisible}
        onCancel={() => setAuthModalVisible(false)}
        footer={null}
        width={400}
      >
        <Alert
          message="SSH Credentials Required"
          description={`Enter your SSH credentials to connect to ${getTargetCount()} selected host(s)`}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAuthSubmit}
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Please enter username' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="SSH username"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Please enter password' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="SSH password"
            />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setAuthModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={executing}>
                Execute Playbook
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PlaybookEditor; 