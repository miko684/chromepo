import {Alert, Col, Form, Input, InputNumber, Radio, Row, Select, Space, Tabs, Typography, message} from 'antd';
import AddableSelect from '/@/components/addable-select';
import {useEffect, useState} from 'react';
import type {DB} from '../../../../../../shared/types/db';
import {GroupBridge, ProxyBridge, TagBridge} from '#preload';
import {TAG_COLORS} from '/@/constants';
import {useTranslation} from 'react-i18next';

const {TextArea} = Input;
const {Text} = Typography;

const createDefaultFingerprint = (): DB.FingerprintConfig => ({
  timezoneMode: 'ip',
  webRTCMode: 'proxy',
  languageMode: 'ip',
  screenMode: 'custom',
  screenResolution: '1920x1080',
  locationMode: 'ip',
  canvasMode: 'noise',
  webGLMode: 'noise',
  audioMode: 'noise',
  clientRectsMode: 'noise',
  hardwareConcurrency: 8,
  deviceMemory: 8,
  platform: 'Win32',
  doNotTrack: 'unspecified',
  webGLVendor: 'Google Inc. (Intel)',
  webGLRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11)',
  platformVersion: '10.0.0',
  architecture: 'x86',
  bitness: '64',
  webGPUMode: 'custom',
  webGPUVendor: '0x8086',
  webGPUArchitecture: 'gen-9',
  webGPUDevice: 'Intel UHD Graphics 630',
  fontTemplate: 'windows-standard',
  cameraCount: 1,
  microphoneCount: 1,
  speakerCount: 1,
  notificationPermission: 'prompt',
  geolocationPermission: 'prompt',
  cameraPermission: 'prompt',
  microphonePermission: 'prompt',
  devicePixelRatio: 1,
  colorDepth: 24,
  maxTouchPoints: 0,
  prefersColorScheme: 'light',
  seed: Math.floor(Math.random() * 2_000_000_000),
});

const WindowEditForm = ({formValue, formChangeCallback, loading}: {
  loading: boolean;
  formValue: DB.Window;
  formChangeCallback: (changed: DB.Window, data: DB.Window) => void;
}) => {
  const [form] = Form.useForm();
  const [groups, setGroups] = useState<DB.Group[]>([]);
  const [tags, setTags] = useState<DB.Tag[]>([]);
  const [proxies, setProxies] = useState<DB.Proxy[]>([]);
  const {t} = useTranslation();
  const [messageApi, contextHolder] = message.useMessage({duration: 3, top: 100});
  const [defaultFingerprint] = useState(createDefaultFingerprint);

  const normalizedValue = {
    ...formValue,
    fingerprintConfig: {...defaultFingerprint, ...formValue.fingerprintConfig},
  };

  useEffect(() => {
    if (JSON.stringify(formValue) === '{}') {
      form.resetFields();
      form.setFieldsValue({fingerprintConfig: defaultFingerprint});
    } else {
      form.setFieldsValue(normalizedValue);
    }
  }, [formValue]);

  const fetchGroups = async () => setGroups(await GroupBridge?.getAll());
  const fetchTags = async () => setTags(await TagBridge?.getAll());
  const fetchProxies = async () => setProxies(await ProxyBridge?.getAll());

  useEffect(() => {
    void fetchGroups();
    void fetchTags();
    void fetchProxies();
  }, []);

  const onAddGroup = async (name: string) => {
    const createdIds = await GroupBridge?.create({name});
    if (!createdIds.length) return false;
    await fetchGroups();
    return true;
  };

  const onRemoveGroup = async (id: number | undefined | string) => {
    const result = await GroupBridge?.delete(Number(id));
    if (result.success) await fetchGroups();
    else messageApi.error(result.message);
  };

  const onAddTag = async (name: string) => {
    const createdIds = await TagBridge?.create({name, color: TAG_COLORS[tags.length % TAG_COLORS.length]});
    if (!createdIds.length) return false;
    await fetchTags();
    return true;
  };

  const onRemoveTag = async (id: number | undefined | string) => {
    const result = await TagBridge?.delete(Number(id));
    if (result.success) await fetchTags();
    else messageApi.error(result.message);
  };

  const filterProxyOption = (input: string, option?: DB.Proxy) =>
    (option?.ip ?? '').toLowerCase().includes(input.toLowerCase()) ||
    (option?.proxy ?? '').toLowerCase().includes(input.toLowerCase()) ||
    (option?.node_name ?? '').toLowerCase().includes(input.toLowerCase()) ||
    (option?.remark ?? '').toLowerCase().includes(input.toLowerCase());

  const proxySelect = (
    <Form.Item name="proxy_id" label={t('window_edit_form_proxy')}>
      <Select
        options={proxies}
        allowClear
        showSearch
        filterOption={filterProxyOption}
        fieldNames={{label: 'proxy', value: 'id'}}
        optionRender={option => (
          <Row justify="space-between" align="middle" wrap={false}>
            <Col flex="42px"><Text code>#{option.data.id}</Text></Col>
            <Col flex="auto" className="min-w-0">
              <Space direction="vertical" size={0} className="w-full">
                <Text ellipsis={{tooltip: option.data.node_name || option.data.proxy}}>{option.data.node_name || option.data.proxy}</Text>
                <Text type="secondary" ellipsis>{option.data.proxy_type?.toUpperCase()} · {option.data.ip_country || t('profile_not_tested')}</Text>
              </Space>
            </Col>
            <Col flex="32px"><Text type="secondary">{option.data.usageCount}</Text></Col>
          </Row>
        )}
      />
    </Form.Item>
  );

  const basicSettings = (
    <div className="profile-tab-pane">
      <Form.Item label={t('window_edit_form_name')} name="name"><Input /></Form.Item>
      <Form.Item name="group_id" label={t('window_edit_form_group')}>
        <AddableSelect options={groups} onAddItem={onAddGroup} addBtnLabel={t('profile_add_group')} onRemoveItem={onRemoveGroup} />
      </Form.Item>
      <Form.Item name="tags" label={t('window_edit_form_tags')}>
        <AddableSelect mode="multiple" options={tags} value={formValue.tags as string[]} onAddItem={onAddTag} addBtnLabel={t('profile_add_tag')} onRemoveItem={onRemoveTag} />
      </Form.Item>
      <Form.Item label={t('window_edit_form_profile_id')} name="profile_id"><Input /></Form.Item>
      <Form.Item name="remark" label={t('window_edit_form_remark')}><TextArea rows={4} /></Form.Item>
    </div>
  );

  const environmentSettings = (
    <div className="profile-tab-pane">
      <Alert className="profile-alert" type="info" showIcon message={t('profile_environment_tip')} />
      <Form.Item label={t('profile_device_template')} name={['fingerprintConfig', 'templateId']}>
        <Input disabled placeholder={t('profile_template_auto')} />
      </Form.Item>
      <Form.Item label={t('profile_user_agent')} name={['fingerprintConfig', 'ua']}><TextArea rows={3} placeholder={t('profile_ua_default')} /></Form.Item>
      <Form.Item label={t('profile_platform')} name={['fingerprintConfig', 'platform']}>
        <Select options={[{label: 'Windows (Win32)', value: 'Win32'}]} />
      </Form.Item>
      <Form.Item label={t('profile_language')} name={['fingerprintConfig', 'languageMode']}>
        <Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_proxy_ip'), value: 'ip'}, {label: t('profile_system'), value: 'system'}, {label: t('profile_custom'), value: 'custom'}]} />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(before, after) => before.fingerprintConfig?.languageMode !== after.fingerprintConfig?.languageMode}>
        {({getFieldValue}) => getFieldValue(['fingerprintConfig', 'languageMode']) === 'custom' ? (
          <Form.Item label={t('profile_locale')} name={['fingerprintConfig', 'language']} rules={[{pattern: /^[a-z]{2,3}(-[A-Z]{2})?$/, message: t('profile_locale_example')}]}><Input placeholder="en-US" /></Form.Item>
        ) : null}
      </Form.Item>
      <Form.Item label={t('profile_resolution')} name={['fingerprintConfig', 'screenMode']}>
        <Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_unspecified'), value: 'default'}, {label: t('profile_custom'), value: 'custom'}]} />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(before, after) => before.fingerprintConfig?.screenMode !== after.fingerprintConfig?.screenMode}>
        {({getFieldValue}) => getFieldValue(['fingerprintConfig', 'screenMode']) === 'custom' ? (
          <Form.Item label={t('profile_screen_size')} name={['fingerprintConfig', 'screenResolution']} rules={[{pattern: /^\d{3,5}x\d{3,5}$/i, message: t('profile_screen_example')}]}><Input placeholder="1920x1080" /></Form.Item>
        ) : null}
      </Form.Item>
    </div>
  );

  const privacySettings = (
    <div className="profile-tab-pane">
      <Alert className="profile-alert" type="info" showIcon message={t('profile_privacy_tip')} />
      <Form.Item label={t('profile_webrtc')} name={['fingerprintConfig', 'webRTCMode']}>
        <Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_protected'), value: 'proxy'}, {label: t('profile_real'), value: 'real'}, {label: t('profile_disabled'), value: 'disabled'}]} />
      </Form.Item>
      <Form.Item label={t('profile_timezone')} name={['fingerprintConfig', 'timezoneMode']}>
        <Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_proxy_ip'), value: 'ip'}, {label: t('profile_system'), value: 'system'}, {label: t('profile_custom'), value: 'custom'}]} />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(before, after) => before.fingerprintConfig?.timezoneMode !== after.fingerprintConfig?.timezoneMode}>
        {({getFieldValue}) => getFieldValue(['fingerprintConfig', 'timezoneMode']) === 'custom' ? (
          <Form.Item label={t('profile_timezone_id')} name={['fingerprintConfig', 'customTimezone']}><Input placeholder="Asia/Shanghai" /></Form.Item>
        ) : null}
      </Form.Item>
      <Form.Item label={t('profile_location')} name={['fingerprintConfig', 'locationMode']}>
        <Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_proxy_ip'), value: 'ip'}, {label: t('profile_custom'), value: 'custom'}, {label: t('profile_disabled'), value: 'disabled'}]} />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(before, after) => before.fingerprintConfig?.locationMode !== after.fingerprintConfig?.locationMode}>
        {({getFieldValue}) => getFieldValue(['fingerprintConfig', 'locationMode']) === 'custom' ? (
          <Row gutter={12} className="profile-inline-fields">
            <Col span={12}><Form.Item label={t('profile_latitude')} name={['fingerprintConfig', 'customLatitude']}><InputNumber min={-90} max={90} precision={6} className="w-full" /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('profile_longitude')} name={['fingerprintConfig', 'customLongitude']}><InputNumber min={-180} max={180} precision={6} className="w-full" /></Form.Item></Col>
          </Row>
        ) : null}
      </Form.Item>
      <Form.Item label={t('profile_dnt')} name={['fingerprintConfig', 'doNotTrack']}>
        <Select options={[{label: t('profile_unspecified'), value: 'unspecified'}, {label: t('profile_enabled'), value: '1'}, {label: t('profile_disabled'), value: '0'}]} />
      </Form.Item>
    </div>
  );

  const hardwareSettings = (
    <div className="profile-tab-pane">
      <Alert className="profile-alert" type="warning" showIcon message={t('profile_noise_tip')} />
      <Form.Item label={t('profile_canvas')} name={['fingerprintConfig', 'canvasMode']}><Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_stable_noise'), value: 'noise'}, {label: t('profile_real'), value: 'real'}]} /></Form.Item>
      <Form.Item label={t('profile_webgl')} name={['fingerprintConfig', 'webGLMode']}><Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_custom'), value: 'noise'}, {label: t('profile_real'), value: 'real'}]} /></Form.Item>
      <Form.Item noStyle shouldUpdate={(before, after) => before.fingerprintConfig?.webGLMode !== after.fingerprintConfig?.webGLMode}>
        {({getFieldValue}) => getFieldValue(['fingerprintConfig', 'webGLMode']) === 'noise' ? (
          <>
            <Form.Item label={t('profile_webgl_vendor')} name={['fingerprintConfig', 'webGLVendor']}><Input /></Form.Item>
            <Form.Item label={t('profile_webgl_renderer')} name={['fingerprintConfig', 'webGLRenderer']}><Input /></Form.Item>
          </>
        ) : null}
      </Form.Item>
      <Form.Item label={t('profile_audio')} name={['fingerprintConfig', 'audioMode']}><Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_stable_noise'), value: 'noise'}, {label: t('profile_real'), value: 'real'}]} /></Form.Item>
      <Form.Item label={t('profile_client_rects')} name={['fingerprintConfig', 'clientRectsMode']}><Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_stable_noise'), value: 'noise'}, {label: t('profile_real'), value: 'real'}]} /></Form.Item>
      <Row gutter={12} className="profile-inline-fields">
        <Col span={12}><Form.Item label={t('profile_cpu')} name={['fingerprintConfig', 'hardwareConcurrency']}><InputNumber min={1} max={64} className="w-full" /></Form.Item></Col>
        <Col span={12}><Form.Item label={t('profile_memory')} name={['fingerprintConfig', 'deviceMemory']}><InputNumber min={1} max={64} className="w-full" /></Form.Item></Col>
      </Row>
      <Form.Item label={t('profile_seed')} name={['fingerprintConfig', 'seed']} extra={t('profile_seed_tip')}><InputNumber min={1} max={2_147_483_647} className="w-full" /></Form.Item>
    </div>
  );

  const advancedFingerprintSettings = (
    <div className="profile-tab-pane">
      <Alert className="profile-alert" type="info" showIcon message={t('profile_advanced_tip')} />
      <Row gutter={12} className="profile-inline-fields">
        <Col span={12}><Form.Item label={t('profile_windows_version')} name={['fingerprintConfig', 'platformVersion']}><Select options={[{label: 'Windows 10', value: '10.0.0'}, {label: 'Windows 11', value: '15.0.0'}]} /></Form.Item></Col>
        <Col span={12}><Form.Item label={t('profile_architecture')} name={['fingerprintConfig', 'architecture']}><Select options={[{label: 'x86-64', value: 'x86'}]} /></Form.Item></Col>
      </Row>
      <Form.Item label={t('profile_webgpu_mode')} name={['fingerprintConfig', 'webGPUMode']}>
        <Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_custom'), value: 'custom'}, {label: t('profile_real'), value: 'real'}, {label: t('profile_disabled'), value: 'disabled'}]} />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(before, after) => before.fingerprintConfig?.webGPUMode !== after.fingerprintConfig?.webGPUMode}>
        {({getFieldValue}) => getFieldValue(['fingerprintConfig', 'webGPUMode']) === 'custom' ? (
          <>
            <Form.Item label={t('profile_webgpu_vendor')} name={['fingerprintConfig', 'webGPUVendor']}><Input /></Form.Item>
            <Form.Item label={t('profile_webgpu_architecture')} name={['fingerprintConfig', 'webGPUArchitecture']}><Input /></Form.Item>
            <Form.Item label={t('profile_webgpu_device')} name={['fingerprintConfig', 'webGPUDevice']}><Input /></Form.Item>
          </>
        ) : null}
      </Form.Item>
      <Form.Item label={t('profile_font_template')} name={['fingerprintConfig', 'fontTemplate']}>
        <Select
          onChange={() => form.setFieldValue(['fingerprintConfig', 'fonts'], undefined)}
          options={[
            {label: t('profile_font_standard'), value: 'windows-standard'},
            {label: t('profile_font_office'), value: 'windows-office'},
            {label: t('profile_font_cjk'), value: 'windows-cjk'},
          ]}
        />
      </Form.Item>
      <Row gutter={12} className="profile-inline-fields">
        <Col span={8}><Form.Item label={t('profile_camera_count')} name={['fingerprintConfig', 'cameraCount']}><InputNumber min={0} max={8} className="w-full" /></Form.Item></Col>
        <Col span={8}><Form.Item label={t('profile_microphone_count')} name={['fingerprintConfig', 'microphoneCount']}><InputNumber min={0} max={8} className="w-full" /></Form.Item></Col>
        <Col span={8}><Form.Item label={t('profile_speaker_count')} name={['fingerprintConfig', 'speakerCount']}><InputNumber min={0} max={8} className="w-full" /></Form.Item></Col>
      </Row>
      <Row gutter={12} className="profile-inline-fields">
        <Col span={8}><Form.Item label={t('profile_dpr')} name={['fingerprintConfig', 'devicePixelRatio']}><InputNumber min={0.5} max={4} step={0.25} className="w-full" /></Form.Item></Col>
        <Col span={8}><Form.Item label={t('profile_color_depth')} name={['fingerprintConfig', 'colorDepth']}><Select options={[{label: '24 bit', value: 24}, {label: '30 bit', value: 30}]} /></Form.Item></Col>
        <Col span={8}><Form.Item label={t('profile_touch_points')} name={['fingerprintConfig', 'maxTouchPoints']}><InputNumber min={0} max={10} className="w-full" /></Form.Item></Col>
      </Row>
      <Form.Item label={t('profile_color_scheme')} name={['fingerprintConfig', 'prefersColorScheme']}><Radio.Group optionType="button" buttonStyle="solid" options={[{label: t('profile_light'), value: 'light'}, {label: t('profile_dark'), value: 'dark'}]} /></Form.Item>
      {(['notification', 'geolocation', 'camera', 'microphone'] as const).map(name => (
        <Form.Item key={name} label={t(`profile_permission_${name}`)} name={['fingerprintConfig', `${name}Permission`]}>
          <Select options={[{label: t('profile_permission_prompt'), value: 'prompt'}, {label: t('profile_permission_granted'), value: 'granted'}, {label: t('profile_permission_denied'), value: 'denied'}]} />
        </Form.Item>
      ))}
    </div>
  );

  const cookieSettings = (
    <div className="profile-tab-pane">
      <Alert className="profile-alert" type="info" showIcon message={t('profile_cookie_tip')} />
      <Form.Item label={t('profile_cookie_json')} name="cookie" labelCol={{span: 24}} wrapperCol={{span: 24}}>
        <TextArea rows={14} placeholder={'[{"name":"session","value":"...","domain":"example.com","path":"/"}]'} />
      </Form.Item>
    </div>
  );

  return (
    <Form
      className="window-profile-form"
      layout="horizontal"
      disabled={loading}
      form={form}
      size="middle"
      initialValues={normalizedValue}
      onValuesChange={(_, values) => formChangeCallback(values, values)}
      labelCol={{span: 6}}
      wrapperCol={{span: 18}}
    >
      {contextHolder}
      <Tabs
        className="window-profile-tabs"
        defaultActiveKey="basic"
        items={[
          {key: 'basic', label: t('profile_tab_basic'), forceRender: true, children: basicSettings},
          {key: 'proxy', label: t('profile_tab_proxy'), forceRender: true, children: <div className="profile-tab-pane"><Alert className="profile-alert" type="info" showIcon message={t('profile_proxy_support')} />{proxySelect}</div>},
          {key: 'environment', label: t('profile_tab_environment'), forceRender: true, children: environmentSettings},
          {key: 'privacy', label: t('profile_tab_privacy'), forceRender: true, children: privacySettings},
          {key: 'hardware', label: t('profile_tab_hardware'), forceRender: true, children: hardwareSettings},
          {key: 'advanced', label: t('profile_tab_advanced'), forceRender: true, children: advancedFingerprintSettings},
          {key: 'cookies', label: t('profile_tab_cookies'), forceRender: true, children: cookieSettings},
        ]}
      />
    </Form>
  );
};

export default WindowEditForm;

