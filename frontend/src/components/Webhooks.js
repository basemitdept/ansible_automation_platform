import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Space,
  Typography,
  Tag,
  Select,
  Switch,
  Tooltip,
  Alert,
  Row,
  Col,
  Divider
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
  CopyOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { webhooksAPI, playbooksAPI, hostsAPI, credentialsAPI } from '../services/api';
import moment from 'moment';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const Webhooks = () => {
  const [webhooks, setWebhooks] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchWebhooks();
    fetchPlaybooks();
    fetchHosts();
    fetchCredentials();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const response = await webhooksAPI.getAll();
      setWebhooks(response.data);
    } catch (error) {
      message.error('Failed to fetch webhooks');
    } finally {
      setLoading(false);
    }
  };

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

  const fetchCredentials = async () => {
    try {
      const response = await credentialsAPI.getAll();
      setCredentials(response.data);
    } catch (error) {
      message.error('Failed to fetch credentials');
    }
  };

  const handleCreate = () => {
    setEditingWebhook(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (webhook) => {
    setEditingWebhook(webhook);
    form.setFieldsValue({
      ...webhook,
      host_ids: webhook.host_ids || [],
      default_variables: webhook.default_variables || {}
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await webhooksAPI.delete(id);
      message.success('Webhook deleted successfully');
      fetchWebhooks();
    } catch (error) {
      message.error('Failed to delete webhook');
    }
  };

  const handleRegenerateToken = async (id) => {
    try {
      await webhooksAPI.regenerateToken(id);
      message.success('Token regenerated successfully');
      fetchWebhooks();
    } catch (error) {
      message.error('Failed to regenerate token');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingWebhook) {
        await webhooksAPI.update(editingWebhook.id, values);
        message.success('Webhook updated successfully');
      } else {
        await webhooksAPI.create(values);
        message.success('Webhook created successfully');
      }
      setModalVisible(false);
      fetchWebhooks();
    } catch (error) {
      message.error(`Failed to ${editingWebhook ? 'update' : 'create'} webhook`);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  const getWebhookUrl = (webhook) => {
    return `${window.location.origin}/api/webhook/trigger/${webhook.token}`;
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space direction="vertical" size="small">
          <Text strong>{text}</Text>
          {record.description && <Text type="secondary" style={{ fontSize: '12px' }}>{record.description}</Text>}
        </Space>
      ),
    },
    {
      title: 'Playbook',
      dataIndex: 'playbook',
      key: 'playbook',
      render: (playbook) => playbook ? playbook.name : 'N/A',
    },
    {
      title: 'Hosts',
      dataIndex: 'host_ids',
      key: 'hosts',
      render: (hostIds) => (
        <Tag color="blue">{hostIds ? hostIds.length : 0} hosts</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) => (
        <Tag color={enabled ? 'green' : 'red'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Usage',
      key: 'usage',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Text style={{ fontSize: '12px' }}>
            Triggered: {record.trigger_count || 0} times
          </Text>
          {record.last_triggered && (
            <Text style={{ fontSize: '12px' }} type="secondary">
              Last: {moment(record.last_triggered).fromNow()}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Webhook URL',
      key: 'webhook_url',
      render: (_, record) => (
        <Space>
          <Tooltip title="Copy webhook URL">
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(getWebhookUrl(record))}
            />
          </Tooltip>
          <Text code style={{ fontSize: '11px', maxWidth: '200px' }} ellipsis>
            {getWebhookUrl(record)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit webhook">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Regenerate token">
            <Popconfirm
              title="Regenerate webhook token?"
              description="This will invalidate the current webhook URL. Are you sure?"
              onConfirm={() => handleRegenerateToken(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button size="small" icon={<ReloadOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Popconfirm
            title="Delete webhook?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <LinkOutlined />
            <Title level={4} style={{ margin: 0 }}>Webhooks</Title>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            New Webhook
          </Button>
        }
        className="card-container"
      >
        <Alert
          message="Webhook Integration"
          description="Create webhook endpoints to trigger playbook executions via HTTP API calls. Each webhook gets a unique URL that can be called from external systems."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Table
          columns={columns}
          dataSource={webhooks}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} webhooks`,
          }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <LinkOutlined />
            {editingWebhook ? 'Edit Webhook' : 'Create New Webhook'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={800}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Webhook Name"
                name="name"
                rules={[
                  { required: true, message: 'Please enter webhook name' },
                  { max: 255, message: 'Name too long' }
                ]}
              >
                <Input placeholder="e.g., Deploy Production" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Status"
                name="enabled"
                valuePropName="checked"
                initialValue={true}
              >
                <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Brief description of this webhook's purpose" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Playbook"
                name="playbook_id"
                rules={[{ required: true, message: 'Please select a playbook' }]}
              >
                <Select placeholder="Select playbook to execute">
                  {playbooks.map(playbook => (
                    <Option key={playbook.id} value={playbook.id}>
                      {playbook.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Default Credential"
                name="credential_id"
              >
                <Select placeholder="Select default credential (optional)" allowClear>
                  {credentials.map(cred => (
                    <Option key={cred.id} value={cred.id}>
                      {cred.name} ({cred.username})
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Target Hosts"
            name="host_ids"
            rules={[{ required: true, message: 'Please select at least one host' }]}
          >
            <Select
              mode="multiple"
              placeholder="Select hosts to execute on"
              showSearch
              filterOption={(input, option) => {
                const host = hosts.find(h => h.id === option.value);
                if (!host) return false;
                const searchText = `${host.name} ${host.hostname}`.toLowerCase();
                return searchText.indexOf(input.toLowerCase()) >= 0;
              }}
            >
              {hosts.map(host => (
                <Option key={host.id} value={host.id}>
                  {host.name} ({host.hostname})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Divider orientation="left">
            <Space>
              <SettingOutlined />
              Default Variables (Optional)
            </Space>
          </Divider>

          <Alert
            message="Default Variables"
            description="Define default values for playbook variables. These can be overridden in the webhook request payload."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            label="Default Variables (JSON)"
            name="default_variables"
          >
            <TextArea
              rows={4}
              placeholder='{"variable_name": "default_value", "another_var": "value"}'
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingWebhook ? 'Update' : 'Create'} Webhook
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Webhooks; 