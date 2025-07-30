import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  GroupOutlined
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { playbooksAPI, hostsAPI, hostGroupsAPI, tasksAPI, credentialsAPI } from '../services/api';

const { Title } = Typography;
const { Option } = Select;

const PlaybookEditor = () => {
  const navigate = useNavigate();
  const [playbooks, setPlaybooks] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [hostGroups, setHostGroups] = useState([]);
  const [credentials, setCredentials] = useState([]);
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
  const [form] = Form.useForm();
  const [variablesForm] = Form.useForm();

  useEffect(() => {
    fetchPlaybooks();
    fetchHosts();
    fetchHostGroups();
    fetchCredentials();
  }, []);

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
        const groupHosts = hosts.filter(host => host.group_id === groupId);
        hostIds.push(...groupHosts.map(host => host.id));
      });
      return hostIds;
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
    
    // Initialize variable values
    const initialValues = {};
    detectedVariables.forEach(variable => {
      initialValues[variable.name] = '';
    });
    
    setVariableValues(initialValues);
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
      
      // Keep existing values for variables that still exist
      detectedVariables.forEach(variable => {
        newValues[variable.name] = currentValues[variable.name] || '';
      });
      
      setVariableValues(newValues);
      variablesForm.setFieldsValue(newValues);
    }
  };

  const handleExecute = async () => {
    if (!selectedPlaybook) {
      message.warning('Please select a playbook');
      return;
    }
    
    const targetHostIds = getTargetHostIds();
    if (!targetHostIds || targetHostIds.length === 0) {
      message.warning('Please select at least one host or group with hosts');
      return;
    }
    
    // Validate variables if they exist
    const detectedVariables = extractVariablesFromContent(selectedPlaybook.content);
    if (detectedVariables.length > 0) {
      try {
        await variablesForm.validateFields();
      } catch (error) {
        message.warning('Please fill in all required variables');
        return;
      }
    }
    
    // If a credential is selected and not using custom auth, execute directly
    if (selectedCredential && !customAuth) {
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

      message.success(`Playbook execution started on ${targetHostIds.length} host(s)`);
      
      // Navigate to the task detail page
      if (response.data.task && response.data.task.id) {
        navigate(`/tasks/${response.data.task.id}`);
      }
      
    } catch (error) {
      message.error('Failed to execute playbook');
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

      message.success(`Playbook execution started on ${targetHostIds.length} host(s)`);
      setAuthModalVisible(false);
      
      // Navigate to the task detail page
      if (response.data.task && response.data.task.id) {
        navigate(`/tasks/${response.data.task.id}`);
      }
      
    } catch (error) {
      message.error('Failed to execute playbook');
    } finally {
      setExecuting(false);
    }
  };

  const editorOptions = {
    selectOnLineNumbers: true,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: false,
    theme: 'vs-dark',
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
              Target Selection:
            </label>
            <div style={{ marginBottom: 8 }}>
              <Radio.Group 
                value={targetType} 
                onChange={(e) => {
                  setTargetType(e.target.value);
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
                const cred = credentials.find(c => c.id === option.value);
                if (!cred) return false;
                const searchText = `${cred.name} ${cred.username}`.toLowerCase();
                return searchText.indexOf(input.toLowerCase()) >= 0;
              }}
            >
              {credentials.map(cred => (
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
            
            {!selectedCredential && !customAuth && (
              <div style={{ marginTop: 8, fontSize: '12px', color: '#ff4d4f' }}>
                Please select credentials or enable custom authentication
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
                description={`Found ${detectedVariables.length} variable(s) in your playbook. Please provide values for execution.`}
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
                  {detectedVariables.map((variable, index) => (
                    <Col span={8} key={variable.name}>
                      <Form.Item
                        label={
                          <Space>
                            <span style={{ fontWeight: 'bold' }}>{variable.name}</span>
                            <span style={{ color: '#999', fontSize: '12px' }}>
                              (detected from playbook)
                            </span>
                          </Space>
                        }
                        name={variable.name}
                        rules={[{ required: true, message: `${variable.name} is required` }]}
                      >
                        <Input 
                          placeholder={`Enter value for ${variable.name}`}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                  ))}
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

        <div style={{ height: '500px', border: '1px solid #d9d9d9', borderRadius: 6 }}>
          <Editor
            height="100%"
            language="yaml"
            value={editorContent}
            onChange={handleEditorChange}
            options={editorOptions}
            theme="vs-dark"
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