package com.tremolosecurity.unison.k8s.targets;

import java.util.Map;
import java.util.Set;

import com.tremolosecurity.config.util.ConfigManager;
import com.tremolosecurity.provisioning.core.ProvisioningException;
import com.tremolosecurity.provisioning.core.User;
import com.tremolosecurity.provisioning.core.UserStoreProvider;
import com.tremolosecurity.provisioning.util.HttpCon;
import com.tremolosecurity.saml.Attribute;

/**
 * AwsUserStoreProvider
 */
public class GitLabUserStoreProvider implements UserStoreProvider {
    String name;
    String token;

    String url;

    @Override
    public void createUser(User arg0, Set<String> arg1, Map<String, Object> arg2) throws ProvisioningException {
        throw new ProvisioningException("Not supported");

    }

    @Override
    public void deleteUser(User arg0, Map<String, Object> arg1) throws ProvisioningException {
        throw new ProvisioningException("Not supported");

    }

    @Override
    public User findUser(String arg0, Set<String> arg1, Map<String, Object> arg2) throws ProvisioningException {
        throw new ProvisioningException("Not supported");
    }

    @Override
    public void init(Map<String, Attribute> cfg, ConfigManager cfgMgr, String name) throws ProvisioningException {
        this.token = cfg.get("token").getValues().get(0);
        this.url = cfg.get("url").getValues().get(0);
        this.name = name;
    }

    @Override
    public void setUserPassword(User arg0, Map<String, Object> arg1) throws ProvisioningException {
        throw new ProvisioningException("Not supported");

    }

    @Override
    public void syncUser(User arg0, boolean arg1, Set<String> arg2, Map<String, Object> arg3)
            throws ProvisioningException {
        throw new ProvisioningException("Not supported");

    }

    /**
     * @return the token
     */
    public String getToken() {
        return token;
    }

    /**
     * @return the url
     */
    public String getUrl() {
        return url;
    }

    

    /**
     * @return the name
     */
    public String getName() {
        return name;
    }
    
}