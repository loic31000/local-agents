package tools

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
)

// EmailTool permet d'envoyer et lire des emails
type EmailTool struct {
	smtpHost string
	smtpPort int
	imapHost string
	imapPort int
	username string
	password string
}

// NewEmailTool crée un nouvel outil email
func NewEmailTool(smtpHost string, smtpPort int, imapHost string, imapPort int) *EmailTool {
	return &EmailTool{
		smtpHost: smtpHost,
		smtpPort: smtpPort,
		imapHost: imapHost,
		imapPort: imapPort,
		username: os.Getenv("EMAIL_USER"),
		password: os.Getenv("EMAIL_PASS"),
	}
}

func (t *EmailTool) Name() string {
	return "email"
}

func (t *EmailTool) Description() string {
	return `Outil pour envoyer et lire des emails.
Actions disponibles:
- send: envoyer un email
- list: lister les emails récents
- read: lire un email spécifique
- search: rechercher des emails
- delete: supprimer un email
- mark_read: marquer comme lu`
}

func (t *EmailTool) Schema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"send", "list", "read", "search", "delete", "mark_read"},
				"description": "Action à effectuer",
			},
			"to": map[string]interface{}{
				"type":        "string",
				"description": "Destinataire(s) séparés par des virgules",
			},
			"subject": map[string]interface{}{
				"type":        "string",
				"description": "Sujet de l'email",
			},
			"body": map[string]interface{}{
				"type":        "string",
				"description": "Corps de l'email",
			},
			"folder": map[string]interface{}{
				"type":        "string",
				"description": "Dossier (INBOX, Sent, etc.)",
			},
			"count": map[string]interface{}{
				"type":        "integer",
				"description": "Nombre d'emails à récupérer",
			},
			"uid": map[string]interface{}{
				"type":        "integer",
				"description": "UID de l'email",
			},
			"query": map[string]interface{}{
				"type":        "string",
				"description": "Requête de recherche",
			},
		},
		"required": []string{"action"},
	}
}

func (t *EmailTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	action, _ := params["action"].(string)

	if t.username == "" || t.password == "" {
		return nil, fmt.Errorf("EMAIL_USER et EMAIL_PASS doivent être définis")
	}

	switch action {
	case "send":
		to, _ := params["to"].(string)
		subject, _ := params["subject"].(string)
		body, _ := params["body"].(string)
		return t.send(to, subject, body)
	case "list":
		folder, _ := params["folder"].(string)
		count := 10
		if c, ok := params["count"].(float64); ok {
			count = int(c)
		}
		return t.list(folder, count)
	case "read":
		uid := uint32(0)
		if u, ok := params["uid"].(float64); ok {
			uid = uint32(u)
		}
		folder, _ := params["folder"].(string)
		return t.read(folder, uid)
	case "search":
		query, _ := params["query"].(string)
		folder, _ := params["folder"].(string)
		return t.search(folder, query)
	case "delete":
		uid := uint32(0)
		if u, ok := params["uid"].(float64); ok {
			uid = uint32(u)
		}
		folder, _ := params["folder"].(string)
		return t.delete(folder, uid)
	case "mark_read":
		uid := uint32(0)
		if u, ok := params["uid"].(float64); ok {
			uid = uint32(u)
		}
		folder, _ := params["folder"].(string)
		return t.markRead(folder, uid)
	default:
		return nil, fmt.Errorf("action inconnue: %s", action)
	}
}

func (t *EmailTool) send(to, subject, body string) (interface{}, error) {
	if to == "" || subject == "" || body == "" {
		return nil, fmt.Errorf("to, subject et body sont requis")
	}

	recipients := strings.Split(to, ",")
	for i, r := range recipients {
		recipients[i] = strings.TrimSpace(r)
	}

	// Construire le message
	msg := fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/plain; charset=\"utf-8\"\r\n"+
		"\r\n"+
		"%s",
		t.username,
		to,
		subject,
		body,
	)

	// Connexion SMTP avec TLS
	auth := smtp.PlainAuth("", t.username, t.password, t.smtpHost)
	addr := fmt.Sprintf("%s:%d", t.smtpHost, t.smtpPort)

	// Pour Gmail et autres avec STARTTLS
	tlsConfig := &tls.Config{
		InsecureSkipVerify: false,
		ServerName:         t.smtpHost,
	}

	conn, err := tls.Dial("tcp", fmt.Sprintf("%s:465", t.smtpHost), tlsConfig)
	if err != nil {
		// Essayer STARTTLS sur port 587
		err = smtp.SendMail(addr, auth, t.username, recipients, []byte(msg))
		if err != nil {
			return nil, fmt.Errorf("erreur envoi: %w", err)
		}
	} else {
		c, err := smtp.NewClient(conn, t.smtpHost)
		if err != nil {
			return nil, err
		}
		defer c.Close()

		if err = c.Auth(auth); err != nil {
			return nil, err
		}
		if err = c.Mail(t.username); err != nil {
			return nil, err
		}
		for _, recipient := range recipients {
			if err = c.Rcpt(recipient); err != nil {
				return nil, err
			}
		}
		w, err := c.Data()
		if err != nil {
			return nil, err
		}
		_, err = w.Write([]byte(msg))
		if err != nil {
			return nil, err
		}
		err = w.Close()
		if err != nil {
			return nil, err
		}
		c.Quit()
	}

	return map[string]interface{}{
		"success":    true,
		"to":         recipients,
		"subject":    subject,
		"sent_at":    time.Now().Format(time.RFC3339),
	}, nil
}

func (t *EmailTool) connectIMAP() (*client.Client, error) {
	addr := fmt.Sprintf("%s:%d", t.imapHost, t.imapPort)
	
	c, err := client.DialTLS(addr, nil)
	if err != nil {
		return nil, fmt.Errorf("connexion IMAP: %w", err)
	}

	if err := c.Login(t.username, t.password); err != nil {
		c.Close()
		return nil, fmt.Errorf("login IMAP: %w", err)
	}

	return c, nil
}

func (t *EmailTool) list(folder string, count int) (interface{}, error) {
	if folder == "" {
		folder = "INBOX"
	}

	c, err := t.connectIMAP()
	if err != nil {
		return nil, err
	}
	defer c.Logout()

	mbox, err := c.Select(folder, false)
	if err != nil {
		return nil, fmt.Errorf("sélection dossier: %w", err)
	}

	if mbox.Messages == 0 {
		return map[string]interface{}{
			"folder":   folder,
			"emails":   []interface{}{},
			"total":    0,
		}, nil
	}

	// Récupérer les derniers messages
	from := uint32(1)
	to := mbox.Messages
	if mbox.Messages > uint32(count) {
		from = mbox.Messages - uint32(count) + 1
	}

	seqSet := new(imap.SeqSet)
	seqSet.AddRange(from, to)

	items := []imap.FetchItem{imap.FetchEnvelope, imap.FetchFlags, imap.FetchUid}
	messages := make(chan *imap.Message, count)

	go func() {
		c.Fetch(seqSet, items, messages)
	}()

	emails := make([]map[string]interface{}, 0, count)
	for msg := range messages {
		if msg.Envelope == nil {
			continue
		}

		from := ""
		if len(msg.Envelope.From) > 0 {
			from = msg.Envelope.From[0].Address()
		}

		isRead := false
		for _, flag := range msg.Flags {
			if flag == imap.SeenFlag {
				isRead = true
				break
			}
		}

		emails = append(emails, map[string]interface{}{
			"uid":     msg.Uid,
			"from":    from,
			"subject": msg.Envelope.Subject,
			"date":    msg.Envelope.Date.Format("2006-01-02 15:04"),
			"read":    isRead,
		})
	}

	// Inverser pour avoir les plus récents en premier
	for i, j := 0, len(emails)-1; i < j; i, j = i+1, j-1 {
		emails[i], emails[j] = emails[j], emails[i]
	}

	return map[string]interface{}{
		"folder": folder,
		"emails": emails,
		"total":  mbox.Messages,
	}, nil
}

func (t *EmailTool) read(folder string, uid uint32) (interface{}, error) {
	if folder == "" {
		folder = "INBOX"
	}
	if uid == 0 {
		return nil, fmt.Errorf("uid requis")
	}

	c, err := t.connectIMAP()
	if err != nil {
		return nil, err
	}
	defer c.Logout()

	_, err = c.Select(folder, false)
	if err != nil {
		return nil, err
	}

	seqSet := new(imap.SeqSet)
	seqSet.AddNum(uid)

	items := []imap.FetchItem{imap.FetchEnvelope, imap.FetchBody}
	messages := make(chan *imap.Message, 1)

	go func() {
		c.UidFetch(seqSet, items, messages)
	}()

	for msg := range messages {
		if msg.Envelope == nil {
			continue
		}

		from := ""
		if len(msg.Envelope.From) > 0 {
			from = msg.Envelope.From[0].Address()
		}

		to := make([]string, 0)
		for _, addr := range msg.Envelope.To {
			to = append(to, addr.Address())
		}

		// Récupérer le corps
		body := ""
		for _, literal := range msg.Body {
			if literal != nil {
				buf := make([]byte, literal.Len())
				literal.Read(buf)
				body = string(buf)
			}
		}

		return map[string]interface{}{
			"uid":     uid,
			"from":    from,
			"to":      to,
			"subject": msg.Envelope.Subject,
			"date":    msg.Envelope.Date.Format("2006-01-02 15:04:05"),
			"body":    body,
		}, nil
	}

	return nil, fmt.Errorf("email non trouvé")
}

func (t *EmailTool) search(folder, query string) (interface{}, error) {
	if folder == "" {
		folder = "INBOX"
	}
	if query == "" {
		return nil, fmt.Errorf("query requise")
	}

	c, err := t.connectIMAP()
	if err != nil {
		return nil, err
	}
	defer c.Logout()

	_, err = c.Select(folder, false)
	if err != nil {
		return nil, err
	}

	criteria := imap.NewSearchCriteria()
	criteria.Text = []string{query}

	uids, err := c.Search(criteria)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"folder": folder,
		"query":  query,
		"uids":   uids,
		"count":  len(uids),
	}, nil
}

func (t *EmailTool) delete(folder string, uid uint32) (interface{}, error) {
	if folder == "" {
		folder = "INBOX"
	}
	if uid == 0 {
		return nil, fmt.Errorf("uid requis")
	}

	c, err := t.connectIMAP()
	if err != nil {
		return nil, err
	}
	defer c.Logout()

	_, err = c.Select(folder, false)
	if err != nil {
		return nil, err
	}

	seqSet := new(imap.SeqSet)
	seqSet.AddNum(uid)

	item := imap.FormatFlagsOp(imap.AddFlags, true)
	flags := []interface{}{imap.DeletedFlag}

	if err := c.UidStore(seqSet, item, flags, nil); err != nil {
		return nil, err
	}

	if err := c.Expunge(nil); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"uid":     uid,
		"action":  "deleted",
	}, nil
}

func (t *EmailTool) markRead(folder string, uid uint32) (interface{}, error) {
	if folder == "" {
		folder = "INBOX"
	}
	if uid == 0 {
		return nil, fmt.Errorf("uid requis")
	}

	c, err := t.connectIMAP()
	if err != nil {
		return nil, err
	}
	defer c.Logout()

	_, err = c.Select(folder, false)
	if err != nil {
		return nil, err
	}

	seqSet := new(imap.SeqSet)
	seqSet.AddNum(uid)

	item := imap.FormatFlagsOp(imap.AddFlags, true)
	flags := []interface{}{imap.SeenFlag}

	if err := c.UidStore(seqSet, item, flags, nil); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"uid":     uid,
		"action":  "marked_read",
	}, nil
}
