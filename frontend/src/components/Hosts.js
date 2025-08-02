import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Space,
  Typography,
  Tag,
  Select,
  Divider,
  Row,
  Col,
  Tabs,
  Badge,
  ColorPicker
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  GroupOutlined,
  UnorderedListOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { hostsAPI, hostGroupsAPI } from '../services/api';
import moment from 'moment';

const { Title } = Typography;

const Hosts = () => {
  const [hosts, setHosts] = useState([]);
  const [hostGroups, setHostGroups] = useState([]);
  const [filteredHosts, setFilteredHosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [editingHost, setEditingHost] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('hosts');
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();
  const [groupForm] = Form.useForm();

  useEffect(() => {
    fetchHosts();
    fetchHostGroups();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchText, selectedGroup, hosts]);

  const fetchHosts = async () => {
    setLoading(true);
    try {
      const response = await hostsAPI.getAll();
      setHosts(response.data);
      applyFilters(response.data);
    } catch (error) {
      message.error('Failed to fetch hosts');
    } finally {
      setLoading(false);
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

  const applyFilters = (hostData = hosts) => {
    let filtered = hostData;
    
    // Filter by search text
    if (searchText) {
      filtered = filtered.filter(host =>
        host.name.toLowerCase().includes(searchText.toLowerCase()) ||
        host.hostname.toLowerCase().includes(searchText.toLowerCase()) ||
        (host.description && host.description.toLowerCase().includes(searchText.toLowerCase()))
      );
    }
    
    // Filter by selected group
    if (selectedGroup) {
      filtered = filtered.filter(host => host.group_id === selectedGroup);
    }
    
    setFilteredHosts(filtered);
  };

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const handleGroupFilter = (groupId) => {
    setSelectedGroup(groupId);
  };

  const handleGroupClick = (groupId) => {
    setSelectedGroup(groupId);
    setActiveTab('hosts');
  };

  const handleCreate = () => {
    setEditingHost(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleBulkCreate = () => {
    bulkForm.resetFields();
    setBulkModalVisible(true);
  };

  const handleGroupCreate = () => {
    setEditingGroup(null);
    groupForm.resetFields();
    setGroupModalVisible(true);
  };

  const handleEdit = (host) => {
    setEditingHost(host);
    form.setFieldsValue(host);
    setModalVisible(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    groupForm.setFieldsValue(group);
    setGroupModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await hostsAPI.delete(id);
      message.success('Host deleted successfully');
      fetchHosts();
    } catch (error) {
      message.error('Failed to delete host');
    }
  };

  const handleDeleteGroup = async (id) => {
    try {
      await hostGroupsAPI.delete(id);
      message.success('Host group deleted successfully');
      fetchHostGroups();
      fetchHosts(); // Refresh hosts to update group references
    } catch (error) {
      message.error('Failed to delete host group');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingHost) {
        await hostsAPI.update(editingHost.id, values);
        message.success('Host updated successfully');
      } else {
        await hostsAPI.create(values);
        message.success('Host created successfully');
      }
      setModalVisible(false);
      fetchHosts();
    } catch (error) {
      message.error(`Failed to ${editingHost ? 'update' : 'create'} host`);
    }
  };

  const handleBulkSubmit = async (values) => {
    try {
      const ips = values.ips.split(/[\n,]/).map(ip => ip.trim()).filter(ip => ip);
      
      if (ips.length === 0) {
        message.error('Please enter at least one IP address');
        return;
      }

      const response = await hostsAPI.createBulk({
        ips,
        group_id: values.group_id,
        description: values.description || ''
      });

      const { total_created, total_errors, errors } = response.data;
      
      if (total_created > 0) {
        message.success(`Successfully created ${total_created} hosts`);
      }
      
      if (total_errors > 0) {
        message.warning(`${total_errors} hosts could not be created. Check console for details.`);
        console.log('Bulk creation errors:', errors);
      }

      setBulkModalVisible(false);
      fetchHosts();
    } catch (error) {
      message.error('Failed to create hosts in bulk');
    }
  };

  const handleGroupSubmit = async (values) => {
    try {
      if (editingGroup) {
        await hostGroupsAPI.update(editingGroup.id, values);
        message.success('Host group updated successfully');
      } else {
        await hostGroupsAPI.create(values);
        message.success('Host group created successfully');
      }
      setGroupModalVisible(false);
      fetchHostGroups();
    } catch (error) {
      message.error(`Failed to ${editingGroup ? 'update' : 'create'} host group`);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <DatabaseOutlined style={{ color: '#52c41a' }} />
          <strong>{text}</strong>
        </Space>
      ),
    },
    {
      title: 'Hostname/IP',
      dataIndex: 'hostname',
      key: 'hostname',
      render: (text) => (
        <Space>
          <GlobalOutlined />
          <code>{text}</code>
        </Space>
      ),
    },
    {
      title: 'OS Type',
      dataIndex: 'os_type',
      key: 'os_type',
      render: (os_type) => (
        <Tag color={os_type === 'windows' ? 'blue' : 'green'}>
          {os_type === 'windows' ? '🪟 Windows' : '🐧 Linux'}
        </Tag>
      ),
      width: 120,
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
      render: (port, record) => (
        <Tag color={record.os_type === 'windows' ? 'orange' : 'cyan'}>
          {port} {record.os_type === 'windows' ? '(WinRM)' : '(SSH)'}
        </Tag>
      ),
      width: 120,
    },
    {
      title: 'Group',
      dataIndex: 'group',
      key: 'group',
      render: (group) => group ? (
        <Tag color={group.color} icon={<GroupOutlined />}>
          {group.name}
        </Tag>
      ) : (
        <Tag color="default">No Group</Tag>
      ),
      width: 150,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => moment(date).format('MMM DD, YYYY HH:mm'),
      width: 180,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            title="Edit"
          />
          <Popconfirm
            title="Are you sure you want to delete this host?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Delete"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'hosts',
      label: (
        <Space>
          <DatabaseOutlined />
          Hosts
          <Badge count={filteredHosts.length} showZero />
        </Space>
      ),
      children: (
        <div>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Input.Search
                placeholder="Search hosts..."
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col span={8}>
              <Select
                placeholder="Filter by group"
                value={selectedGroup}
                onChange={handleGroupFilter}
                allowClear
                style={{ width: '100%' }}
              >
                {hostGroups.map(group => (
                  <Select.Option key={group.id} value={group.id}>
                    <Tag color={group.color} style={{ marginRight: 8 }}>
                      {group.name}
                    </Tag>
                    ({group.host_count} hosts)
                  </Select.Option>
                ))}
              </Select>
            </Col>
            <Col span={8}>
              <Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleCreate}
                >
                  New Host
                </Button>
                <Button
                  icon={<UnorderedListOutlined />}
                  onClick={handleBulkCreate}
                >
                  Bulk Add
                </Button>
              </Space>
            </Col>
          </Row>
          <Table
            columns={columns}
            dataSource={filteredHosts}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `Total ${total} hosts`,
            }}
          />
        </div>
      ),
    },
    {
      key: 'groups',
      label: (
        <Space>
          <GroupOutlined />
          Groups
          <Badge count={hostGroups.length} showZero />
        </Space>
      ),
      children: (
        <div>
          <Row style={{ marginBottom: 16 }}>
            <Col span={24} style={{ textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleGroupCreate}
              >
                New Group
              </Button>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            {hostGroups.map(group => (
              <Col key={group.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <GroupOutlined style={{ color: group.color }} />
                      {group.name}
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditGroup(group);
                        }}
                      />
                      <Popconfirm
                        title="Delete this group?"
                        description="Hosts in this group will be ungrouped."
                        onConfirm={() => handleDeleteGroup(group.id)}
                        okText="Yes"
                        cancelText="No"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>
                    </Space>
                  }
                  style={{ 
                    borderLeft: `4px solid ${group.color}`,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  hoverable
                  onClick={() => handleGroupClick(group.id)}
                >
                  <p>{group.description || 'No description'}</p>
                  <Badge count={group.host_count} showZero>
                    <span>Hosts</span>
                  </Badge>
                  <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                    Click to view hosts
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <DatabaseOutlined />
            <Title level={4} style={{ margin: 0 }}>Host Management</Title>
          </Space>
        }
        className="card-container"
      >
        <Tabs 
          items={tabItems} 
          activeKey={activeTab}
          onChange={setActiveTab}
        />
      </Card>

      {/* Host Creation/Edit Modal */}
      <Modal
        title={
          <Space>
            <DatabaseOutlined />
            {editingHost ? 'Edit Host' : 'Add New Host'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label="Host Name"
            name="name"
            rules={[
              { required: true, message: 'Please enter host name' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: 'Name can only contain letters, numbers, underscores, and hyphens' }
            ]}
          >
            <Input placeholder="e.g., web-server-01" />
          </Form.Item>

          <Form.Item
            label="Hostname or IP Address"
            name="hostname"
            rules={[{ required: true, message: 'Please enter hostname or IP address' }]}
          >
            <Input placeholder="e.g., 192.168.1.100 or server.example.com" />
          </Form.Item>

          <Form.Item
            label="Operating System"
            name="os_type"
            initialValue="linux"
            rules={[{ required: true, message: 'Please select operating system' }]}
          >
            <Select 
              placeholder="Select OS type"
              onChange={(value) => {
                // Auto-set default port based on OS type
                const defaultPort = value === 'windows' ? 5986 : 22;
                form.setFieldsValue({ port: defaultPort });
              }}
            >
              <Select.Option value="linux">
                <Space>
                  🐧 Linux (SSH - Port 22)
                </Space>
              </Select.Option>
              <Select.Option value="windows">
                <Space>
                  🪟 Windows (WinRM - Port 5986)
                </Space>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Port"
            name="port"
            initialValue={22}
            rules={[
              { required: true, message: 'Please enter port number' },
              { type: 'number', min: 1, max: 65535, message: 'Port must be between 1 and 65535' }
            ]}
          >
            <InputNumber 
              min={1} 
              max={65535} 
              placeholder="e.g., 22 for SSH or 5986 for WinRM"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            label="Host Group"
            name="group_id"
          >
            <Select placeholder="Select a group (optional)" allowClear>
              {hostGroups.map(group => (
                <Select.Option key={group.id} value={group.id}>
                  <Tag color={group.color} style={{ marginRight: 8 }}>
                    {group.name}
                  </Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Brief description of this host" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingHost ? 'Update' : 'Add'} Host
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Bulk Host Creation Modal */}
      <Modal
        title={
          <Space>
            <UnorderedListOutlined />
            Bulk Add Hosts
          </Space>
        }
        open={bulkModalVisible}
        onCancel={() => setBulkModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={bulkForm}
          layout="vertical"
          onFinish={handleBulkSubmit}
        >
          <Form.Item
            label="IP Addresses"
            name="ips"
            rules={[{ required: true, message: 'Please enter IP addresses' }]}
            extra="Enter IP addresses separated by commas or new lines"
          >
            <Input.TextArea
              rows={8}
              placeholder={`192.168.1.10
192.168.1.11
192.168.1.12
Or: 192.168.1.10, 192.168.1.11, 192.168.1.12`}
            />
          </Form.Item>

          <Form.Item
            label="Assign to Group"
            name="group_id"
          >
            <Select placeholder="Select a group (optional)" allowClear>
              {hostGroups.map(group => (
                <Select.Option key={group.id} value={group.id}>
                  <Tag color={group.color} style={{ marginRight: 8 }}>
                    {group.name}
                  </Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Description for all hosts (optional)" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Create Hosts
              </Button>
              <Button onClick={() => setBulkModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Host Group Creation/Edit Modal */}
      <Modal
        title={
          <Space>
            <GroupOutlined />
            {editingGroup ? 'Edit Host Group' : 'Create Host Group'}
          </Space>
        }
        open={groupModalVisible}
        onCancel={() => setGroupModalVisible(false)}
        footer={null}
      >
        <Form
          form={groupForm}
          layout="vertical"
          onFinish={handleGroupSubmit}
        >
          <Form.Item
            label="Group Name"
            name="name"
            rules={[
              { required: true, message: 'Please enter group name' },
              { pattern: /^[a-zA-Z0-9_\s-]+$/, message: 'Name can only contain letters, numbers, spaces, underscores, and hyphens' }
            ]}
          >
            <Input placeholder="e.g., Production Servers" />
          </Form.Item>

          <Form.Item
            label="Color"
            name="color"
            initialValue="#1890ff"
          >
            <ColorPicker showText />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input.TextArea rows={3} placeholder="Brief description of this group" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingGroup ? 'Update' : 'Create'} Group
              </Button>
              <Button onClick={() => setGroupModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Hosts; 