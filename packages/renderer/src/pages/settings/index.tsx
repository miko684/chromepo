import {Alert, Button, Card, Form, Input, Select, Space, Switch} from 'antd';
import {CommonBridge} from '#preload';
import {useEffect, useState} from 'react';
import type {SettingOptions} from '../../../../shared/types/common';
import {useTranslation} from 'react-i18next';

type FieldType = {
  uiLanguage: 'zh' | 'en';
  uiTheme: 'light' | 'dark' | 'system';
  strictProxyMode: boolean;
  profileCachePath: string;
  useLocalChrome: boolean;
  localChromePath: string;
  chromiumBinPath: string;
  automationConnect: boolean;
};

const Settings = () => {
  const [formValue, setFormValue] = useState<SettingOptions>({
    uiLanguage: 'zh',
    uiTheme: 'light',
    strictProxyMode: true,
    profileCachePath: '',
    useLocalChrome: true,
    localChromePath: '',
    chromiumBinPath: '',
    automationConnect: false,
  licenseServerUrl: 'http://39.103.68.127:3000',
    licenseEnforced: false,
  });
  const [form] = Form.useForm();
  const {t, i18n} = useTranslation();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const settings = await CommonBridge.getSettings();
    const normalizedSettings = {...settings, uiLanguage: settings.uiLanguage || 'zh'};
    setFormValue(normalizedSettings);
    form.setFieldsValue(normalizedSettings);
    localStorage.setItem('chrome-power-ui-language', normalizedSettings.uiLanguage);
    await i18n.changeLanguage(normalizedSettings.uiLanguage);
  };

  const handleSave = async (values: SettingOptions) => {
    await CommonBridge.saveSettings(values);
  };

  const handleChoosePath = async (
    field: 'profileCachePath' | 'localChromePath' | 'chromiumBinPath',
    type: 'openFile' | 'openDirectory',
  ) => {
    const path = await CommonBridge.choosePath(type);
    if (!formValue[field] || (path && formValue[field] !== path)) {
      handleFormValueChange({
        ...formValue,
        [field]: path,
      });
    }
  };

  const handleFormValueChange = (changed: SettingOptions) => {
    const newFormValue = {
      ...formValue,
      ...changed,
    };
    if (changed.uiLanguage) {
      localStorage.setItem('chrome-power-ui-language', changed.uiLanguage);
      void i18n.changeLanguage(changed.uiLanguage);
    }
    if (changed.uiTheme) {
      localStorage.setItem('chrome-power-ui-theme', changed.uiTheme);
      window.dispatchEvent(new CustomEvent('chrome-power-theme-change', {detail: changed.uiTheme}));
    }
    setFormValue(newFormValue);
    handleSave(newFormValue);
  };

  // type FieldType = SettingOptions;

  return (
    <>
      <Card
        className="content-card p-6"
        bordered={false}
      >
        <Form
          name="settingsForm"
          className="w-2/3"
          labelCol={{span: 5}}
          size="large"
          form={form}
          initialValues={formValue}
          onValuesChange={handleFormValueChange}
        >
          <Alert
            type="info"
            showIcon
            className="mb-6"
            message={t('settings_ui_language_tip')}
          />
          <Form.Item<FieldType>
            label={t('settings_ui_language')}
            name="uiLanguage"
          >
            <Select
              options={[
                {label: t('language_zh'), value: 'zh'},
                {label: t('language_en'), value: 'en'},
              ]}
            />
          </Form.Item>
          <Form.Item label="软件授权" extra="授权服务由客户端入口统一管理，授权地址不会在界面中暴露或修改。">
            <div className="text-gray-500">授权状态由启动入口检查</div>
          </Form.Item>
          <Form.Item<FieldType>
            label="界面主题"
            name="uiTheme"
            extra="仅改变 Orbit Browser 管理界面，不会改变浏览器环境的深色模式指纹。"
          >
            <Select options={[
              {label: '日间模式', value: 'light'},
              {label: '夜间模式', value: 'dark'},
              {label: '跟随系统', value: 'system'},
            ]} />
          </Form.Item>
          <Form.Item<FieldType>
            label={t('settings_strict_proxy')}
            name="strictProxyMode"
            valuePropName="checked"
            extra={t('settings_strict_proxy_tip')}
          >
            <Switch />
          </Form.Item>
          <Form.Item<FieldType>
            label={t('settings_cache_path')}
            name="profileCachePath"
          >
            <Space.Compact style={{width: '100%'}}>
              <Input
                readOnly
                disabled
                value={formValue.profileCachePath}
              />
              <Button
                type="default"
                onClick={() => handleChoosePath('profileCachePath', 'openDirectory')}
              >
                {t('settings_choose_cache_path')}
              </Button>
            </Space.Compact>
          </Form.Item>
          {/* <Form.Item<FieldType>
            label={t('settings_use_local_chrome')}
            name="useLocalChrome"
          >
            <Switch value={formValue.useLocalChrome} />
          </Form.Item> */}
          {formValue.useLocalChrome ? (
            <Form.Item<FieldType>
              label={t('settings_chrome_path')}
              name="localChromePath"
            >
              <Space.Compact style={{width: '100%'}}>
                <Input
                  readOnly
                  disabled
                  value={formValue.localChromePath}
                />
                <Button
                  type="default"
                  onClick={() => handleChoosePath('localChromePath', 'openFile')}
                >
                  {t('settings_choose_cache_path')}
                </Button>
              </Space.Compact>
            </Form.Item>
          ) : (
            <Form.Item<FieldType>
              label={t('setting_chromium_path')}
              name="chromiumBinPath"
            >
              <Space.Compact style={{width: '100%'}}>
                <Input
                  readOnly
                  disabled
                  value={formValue.chromiumBinPath}
                />
                <Button
                  type="default"
                  onClick={() => handleChoosePath('chromiumBinPath', 'openFile')}
                >
                  {t('settings_choose_cache_path')}
                </Button>
              </Space.Compact>
            </Form.Item>
          )}
          {/* <Form.Item<FieldType>
            label={t('settings_automation_connect')}
            name="automationConnect"
            >
              <Switch value={formValue.automationConnect} />
          </Form.Item> */}
        </Form>
      </Card>
      {/* <div className="content-footer pl-24">
        <Button
          type="primary"
          className="w-20"
          onClick={() => handleSave(formValue)}
        >
          {t('footer_ok')}
        </Button>
      </div> */}
    </>
  );
};
export default Settings;

