package com.tremolosecurity.unison.k8s.tasks;

import java.io.IOException;
import java.util.Base64;
import java.util.Map;

import com.tremolosecurity.provisioning.core.ProvisioningException;
import com.tremolosecurity.provisioning.core.User;
import com.tremolosecurity.provisioning.core.WorkflowTask;
import com.tremolosecurity.provisioning.util.CustomTask;
import com.tremolosecurity.provisioning.util.HttpCon;
import com.tremolosecurity.proxy.ConfigSys;
import com.tremolosecurity.saml.Attribute;
import com.tremolosecurity.server.GlobalEntries;
import com.tremolosecurity.unison.openshiftv3.OpenShiftTarget;

import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;

public class BuildDockerToken implements CustomTask {

    String registryHost;
    String target;
    String prodTarget;

    @Override
    public boolean doTask(User user, Map<String, Object> request) throws ProvisioningException {
        String projectName = (String) request.get("projectName");
        OpenShiftTarget oc = (OpenShiftTarget) GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().getTarget(target).getProvider();

        JSONParser parser = new JSONParser();
        HttpCon con = null;
        
        try {
            con = oc.createClient();
            
            JSONObject secretForSA = null;
            
            String json = oc.callWS(oc.getAuthToken(), con, "/api/v1/namespaces/" + projectName + "-test/serviceaccounts/deployer");
            JSONObject root = (JSONObject) parser.parse(json);

            JSONArray secrets = (JSONArray) root.get("secrets");

            for (Object o : secrets) {
                JSONObject secretData = (JSONObject) o;
                String name = (String) secretData.get("name");
                if (name.startsWith("deployer-token-")) {
                    json = oc.callWS(oc.getAuthToken(), con, "/api/v1/namespaces/" + projectName + "-test/secrets/" + name);
                    secretForSA = (JSONObject) parser.parse(json);
                    break;
                }
            }
            
            

            if (secretForSA == null) {
                throw new Exception("No secret found");
            }

            String tokenEncoded = (String) ((JSONObject) secretForSA.get("data")).get("token");
            String token = new String(Base64.getDecoder().decode(tokenEncoded));

            JSONObject dockerCreds = new JSONObject();
            JSONObject dcAuths = new JSONObject();
            dockerCreds.put("auths", dcAuths);
            JSONObject regDomain = new JSONObject();
            dcAuths.put(this.registryHost, regDomain);
            regDomain.put("username", "pull");
            regDomain.put("password", token);
            regDomain.put("email", "doesnotmatter@doesnotmatter.com");
            regDomain.put("auth", new String(Base64.getEncoder().encode(("pull:" + token).getBytes("UTF-8"))));

            String dockerToken = dockerCreds.toString();
            String b64EncodedDockerToken = Base64.getEncoder().encodeToString(dockerToken.getBytes("UTF-8"));

            request.put("b64EncodedDockerToken", b64EncodedDockerToken);

            //get the prod default service account
            OpenShiftTarget prodOcp = (OpenShiftTarget) GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().getTarget(this.prodTarget).getProvider();
            json = prodOcp.callWS(prodOcp.getAuthToken(), con, "/api/v1/namespaces/" + projectName + "-prod/serviceaccounts/default");
            root = (JSONObject) parser.parse(json);

            JSONArray imagePullSecrets = (JSONArray) root.get("imagePullSecrets");

            JSONObject obj = new JSONObject();
            obj.put("name", projectName + "-pull");

            imagePullSecrets.add(obj);
            request.put("patchData",imagePullSecrets.toString());
        } catch (Exception e) {
            throw new ProvisioningException("Could not get secrets",e);
        } finally {
            if (con != null) {
                try {
                    con.getHttp().close();
                } catch (IOException e) {
                   
				}
                con.getBcm().close();
            }
         }
        return true;
    }

    @Override
    public void init(WorkflowTask task, Map<String, Attribute> config) throws ProvisioningException {
        this.registryHost = config.get("registryHost").getValues().get(0);
        this.target = config.get("target").getValues().get(0);
        this.prodTarget = config.get("prodTarget").getValues().get(0);
	}

	@Override
	public void reInit(WorkflowTask task) throws ProvisioningException {
		
	}

    
}